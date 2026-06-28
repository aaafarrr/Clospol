import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import path from "path";
import { Folder, File as PrismaFile } from "@prisma/client";
import prisma from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";
import { StorageUploaderService } from "@/services/storage/uploader";
import { UploadRoutingService } from "@/services/storage/routing";

/**
 * Perform Basic Authentication check on the incoming WebDAV request.
 */
async function authenticate(request: Request) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("basic ")) {
    return null;
  }

  const credentials = Buffer.from(auth.substring(6), "base64").toString("utf-8").split(":");
  if (credentials.length < 2) return null;

  const [email, password] = credentials;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;

  const match = await verifyPassword(password, user.passwordHash);
  if (!match) return null;

  return user;
}

/**
 * Resolve the virtual URL path segments into SQLite directory entities.
 */
async function resolvePath(pathSegments: string[], userId: string): Promise<{ type: string; id: string | null; item: any; parentId: string | null } | null> {
  let currentFolderId: string | null = null;
  
  if (pathSegments.length === 0) {
    return { type: "root", id: null, item: null, parentId: null };
  }

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = decodeURIComponent(pathSegments[i]);

    if (i === pathSegments.length - 1) {
      // Last segment: Check folder first, then file
      const targetFolder: Folder | null = await prisma.folder.findFirst({
        where: {
          userId,
          name: segment,
          parentId: currentFolderId,
          deletedAt: null,
        },
      });

      if (targetFolder) {
        return { type: "folder", id: targetFolder.id, item: targetFolder, parentId: currentFolderId };
      }

      const file: PrismaFile | null = await prisma.file.findFirst({
        where: {
          userId,
          name: segment,
          folderId: currentFolderId,
          status: "active",
          deletedAt: null,
        },
      });

      if (file) {
        return { type: "file", id: file.id, item: file, parentId: currentFolderId };
      }

      return { type: "none", id: null, item: null, parentId: currentFolderId };
    } else {
      // Parent segments: Must be folders
      const nextFolder: Folder | null = await prisma.folder.findFirst({
        where: {
          userId,
          name: segment,
          parentId: currentFolderId,
          deletedAt: null,
        },
      });

      if (!nextFolder) {
        return null; // Invalid path
      }
      currentFolderId = nextFolder.id;
    }
  }

  return null;
}

/**
 * Build Multi-Status XML response (HTTP 207) for PROPFIND.
 */
function buildXmlPropfindResponse(responses: any[]): string {
  let xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
  xml += '<d:multistatus xmlns:d="DAV:">\n';

  for (const r of responses) {
    xml += "  <d:response>\n";
    xml += `    <d:href>${escapeXml(r.href)}</d:href>\n`;
    xml += "    <d:propstat>\n";
    xml += "      <d:prop>\n";
    xml += `        <d:displayname>${escapeXml(r.displayname)}</d:displayname>\n`;
    
    if (r.isCollection) {
      xml += "        <d:resourcetype><d:collection/></d:resourcetype>\n";
    } else {
      xml += "        <d:resourcetype/>\n";
      xml += `        <d:getcontentlength>${r.size}</d:getcontentlength>\n`;
      xml += `        <d:getcontenttype>${escapeXml(r.mime)}</d:getcontenttype>\n`;
    }

    if (r.modified) {
      xml += `        <d:getlastmodified>${r.modified.toUTCString()}</d:getlastmodified>\n`;
    }
    if (r.created) {
      xml += `        <d:creationdate>${r.created.toISOString()}</d:creationdate>\n`;
    }

    xml += "      </d:prop>\n";
    xml += "      <d:status>HTTP/1.1 200 OK</d:status>\n";
    xml += "    </d:propstat>\n";
    xml += "  </d:response>\n";
  }

  xml += "</d:multistatus>";
  return xml;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case "\"": return "&quot;";
      default: return c;
    }
  });
}

function getUnauthorizedResponse() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Clospol DAV"',
    },
  });
}

// OPTIONS method handler (built-in support in Next.js)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      DAV: "1, 2",
      Allow: "GET, POST, OPTIONS, PROPFIND, PROPPATCH, MKCOL, PUT, DELETE, LOCK, UNLOCK, COPY, MOVE",
      "MS-Author-Via": "DAV",
    },
  });
}

// GET method handler - Streams/Downloads file
export async function GET(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await authenticate(request);
  if (!user) return getUnauthorizedResponse();

  const pathParams = await params;
  const segments = pathParams.path || [];
  const resolved = await resolvePath(segments, user.id);

  if (!resolved || resolved.type === "none") {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (resolved.type !== "file" || !resolved.item) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const file = resolved.item as any; // Cast to file type
  const range = request.headers.get("Range") || undefined;

  try {
    let stream: Readable;
    if (file.provider === "local") {
      stream = LocalStorageService.streamLocalFile(file);
    } else if (file.provider === "s3") {
      stream = await S3StorageService.streamS3File(file, range);
    } else if (file.provider === "google_drive") {
      stream = await GoogleDriveService.streamGoogleFile(file);
    } else {
      return new NextResponse("Unsupported Provider", { status: 500 });
    }

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Length": file.sizeBytes.toString(),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
    };

    if (range) {
      headers["Accept-Ranges"] = "bytes";
      headers["Content-Range"] = range; // Simple fallback
    }

    // Convert Node Readable to Web ReadableStream for Next.js response
    const webStream = Readable.toWeb(stream);
    return new NextResponse(webStream as any, { headers });

  } catch (err: any) {
    console.error(`WebDAV GET stream failed: ${err.message}`);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// DELETE handler - Force Deletes File or Folder
export async function DELETE(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await authenticate(request);
  if (!user) return getUnauthorizedResponse();

  const pathParams = await params;
  const segments = pathParams.path || [];
  const resolved = await resolvePath(segments, user.id);

  if (!resolved || resolved.type === "none") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    if (resolved.type === "file" && resolved.item) {
      const file = resolved.item as any;
      if (file.provider === "s3") {
        await S3StorageService.deleteS3Object(file);
      } else if (file.provider === "local") {
        await LocalStorageService.deleteLocalFile(file);
      } else if (file.provider === "google_drive") {
        await GoogleDriveService.deleteGoogleFile(file);
      }
      await prisma.file.delete({ where: { id: file.id } });

    } else if (resolved.type === "folder" && resolved.item) {
      const folder = resolved.item as any;
      // Simple recursive DB delete of child folders/files
      const deleteFolderRecursively = async (fid: string) => {
        const subfolders = await prisma.folder.findMany({ where: { parentId: fid } });
        for (const sf of subfolders) await deleteFolderRecursively(sf.id);

        const subfiles = await prisma.file.findMany({ where: { folderId: fid } });
        for (const f of subfiles) {
          try {
            if (f.provider === "s3") await S3StorageService.deleteS3Object(f);
            else if (f.provider === "local") await LocalStorageService.deleteLocalFile(f);
            else if (f.provider === "google_drive") await GoogleDriveService.deleteGoogleFile(f);
          } catch (_) {}
          await prisma.file.delete({ where: { id: f.id } });
        }

        await prisma.folder.delete({ where: { id: fid } });
      };

      await deleteFolderRecursively(folder.id);
    }

    return new NextResponse(null, { status: 204 });

  } catch (err: any) {
    console.error(`WebDAV DELETE failed: ${err.message}`);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// PUT method handler - Streams file uploads
export async function PUT(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await authenticate(request);
  if (!user) return getUnauthorizedResponse();

  const pathParams = await params;
  const segments = pathParams.path || [];
  if (segments.length === 0) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const fileName = decodeURIComponent(segments[segments.length - 1]);
  let parentFolderId: string | null = null;

  if (segments.length > 1) {
    const parentSegments = segments.slice(0, -1);
    const parentResolved = await resolvePath(parentSegments, user.id);
    if (!parentResolved || parentResolved.type !== "folder") {
      return new NextResponse("Conflict", { status: 409 });
    }
    parentFolderId = parentResolved.id;
  }

  const resolved = await resolvePath(segments, user.id);

  // If file already exists, delete it first to overwrite
  if (resolved && resolved.type === "file" && resolved.item) {
    const file = resolved.item as any;
    try {
      if (file.provider === "s3") await S3StorageService.deleteS3Object(file);
      else if (file.provider === "local") await LocalStorageService.deleteLocalFile(file);
      else if (file.provider === "google_drive") await GoogleDriveService.deleteGoogleFile(file);
      await prisma.file.delete({ where: { id: file.id } });
    } catch (_) {}
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  const ext = path.extname(fileName).toLowerCase();
  
  // Quick mime type resolver
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".mp4": "video/mp4",
    ".ts": "video/mp2t",
  };
  const mimeType = mimeTypes[ext] || "application/octet-stream";

  // Select Storage Account
  const storageAccount = await UploadRoutingService.selectRoutingAccount(user.id, contentLength);
  if (!storageAccount) {
    return new NextResponse("Insufficient Storage", { status: 507 });
  }

  if (!request.body) {
    return new NextResponse("Empty Request Body", { status: 400 });
  }

  const nodeStream = Readable.fromWeb(request.body as any);

  try {
    await StorageUploaderService.uploadAndSaveFile(
      user.id,
      storageAccount,
      fileName,
      mimeType,
      contentLength,
      parentFolderId,
      nodeStream
    );

    return new NextResponse(null, { status: 201 });
  } catch (err: any) {
    console.error(`WebDAV PUT failed: ${err.message}`);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// POST handler: Intercepts POST, but also routes custom WebDAV methods mapped in server.js
export async function POST(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const user = await authenticate(request);
  if (!user) return getUnauthorizedResponse();

  const pathParams = await params;
  const segments = pathParams.path || [];
  const resolved = await resolvePath(segments, user.id);

  if (!resolved) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const methodOverride = request.headers.get("x-dav-method") || "POST";
  const cleanPath = "/" + segments.map(rawurlencode).join("/");

  switch (methodOverride) {
    case "PROPFIND": {
      const depth = request.headers.get("Depth") || "1";
      const responses: any[] = [];

      // Current resource info
      if (resolved.type === "root") {
        responses.push({
          href: "/dav/",
          displayname: "dav",
          isCollection: true,
          size: 0,
          mime: "",
          created: new Date(),
          modified: new Date(),
        });
      } else if (resolved.type === "folder" && resolved.item) {
        const item = resolved.item as any;
        responses.push({
          href: `/dav${cleanPath}/`,
          displayname: item.name,
          isCollection: true,
          size: 0,
          mime: "",
          created: item.createdAt,
          modified: item.updatedAt,
        });
      } else if (resolved.type === "file" && resolved.item) {
        const item = resolved.item as any;
        responses.push({
          href: `/dav${cleanPath}`,
          displayname: item.name,
          isCollection: false,
          size: item.sizeBytes.toString(),
          mime: item.mimeType,
          created: item.createdAt,
          modified: item.updatedAt,
        });
      }

      // Children info
      if (depth === "1" && (resolved.type === "root" || resolved.type === "folder")) {
        const parentId = resolved.type === "root" ? null : resolved.id;

        const folders = await prisma.folder.findMany({
          where: { userId: user.id, parentId, deletedAt: null },
        });

        const files = await prisma.file.findMany({
          where: { userId: user.id, folderId: parentId, status: "active", deletedAt: null },
        });

        for (const f of folders) {
          responses.push({
            href: `/dav${cleanPath === "/" ? "" : cleanPath}/${rawurlencode(f.name)}/`,
            displayname: f.name,
            isCollection: true,
            size: 0,
            mime: "",
            created: f.createdAt,
            modified: f.updatedAt,
          });
        }

        for (const f of files) {
          responses.push({
            href: `/dav${cleanPath === "/" ? "" : cleanPath}/${rawurlencode(f.name)}`,
            displayname: f.name,
            isCollection: false,
            size: f.sizeBytes.toString(),
            mime: f.mimeType,
            created: f.createdAt,
            modified: f.updatedAt,
          });
        }
      }

      const xml = buildXmlPropfindResponse(responses);
      return new NextResponse(xml, {
        status: 207,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    case "PROPPATCH": {
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>${escapeXml(request.url)}</d:href>
    <d:propstat>
      <d:prop>
        <d:win32creationtime/>
        <d:win32lastaccesscheck/>
        <d:win32lastwritetime/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

      return new NextResponse(xml, {
        status: 207,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    case "MKCOL": {
      const folderName = decodeURIComponent(segments[segments.length - 1]);
      let parentId: string | null = null;

      if (segments.length > 1) {
        const parentSegments = segments.slice(0, -1);
        const parentResolved = await resolvePath(parentSegments, user.id);
        if (!parentResolved || parentResolved.type !== "folder") {
          return new NextResponse("Conflict", { status: 409 });
        }
        parentId = parentResolved.id;
      }

      await prisma.folder.create({
        data: {
          userId: user.id,
          name: folderName,
          parentId,
        },
      });

      return new NextResponse(null, { status: 201 });
    }

    case "LOCK": {
      const lockToken = `opaquelocktoken:dav-lock-token-${Math.random().toString(36).substring(2)}`;
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:prop xmlns:d="DAV:">
  <d:lockdiscovery>
    <d:activelock>
      <d:locktype><d:write/></d:locktype>
      <d:lockscope><d:exclusive/></d:lockscope>
      <d:depth>Infinity</d:depth>
      <d:owner>Clospol Client</d:owner>
      <d:timeout>Second-3600</d:timeout>
      <d:locktoken><d:href>${escapeXml(lockToken)}</d:href></d:locktoken>
    </d:activelock>
  </d:lockdiscovery>
</d:prop>`;

      return new NextResponse(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Lock-Token": `<${lockToken}>`,
        },
      });
    }

    case "UNLOCK": {
      return new NextResponse(null, { status: 204 });
    }

    default:
      return new NextResponse("Method Not Allowed", { status: 405 });
  }
}

function rawurlencode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}
