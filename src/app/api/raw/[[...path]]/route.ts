import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  try {
    const isEnabled = process.env.RAW_RESOLVER_ENABLED !== "false";
    if (!isEnabled) {
      return new NextResponse("Raw Path Resolver is disabled by administrator.", { status: 403 });
    }

    const accessType = process.env.RAW_RESOLVER_ACCESS_TYPE || "authenticated";
    let user = await getAuthenticatedUser(req);
    
    if (!user) {
      if (accessType === "public") {
        user = await prisma.user.findFirst();
      } else {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }

    if (!user) {
      return new NextResponse("User context could not be resolved", { status: 500 });
    }

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:read")) {
        return new NextResponse("Forbidden: scope 'files:read' is required", { status: 403 });
      }
    }

    const resolvedParams = await params;
    const rawSegments = resolvedParams.path || [];
    const pathSegments = rawSegments.map(seg => decodeURIComponent(seg));

    // Whitelist and Blacklist parsing
    const allowedFoldersStr = process.env.RAW_RESOLVER_ALLOWED_FOLDERS || "";
    const allowedFolders = allowedFoldersStr.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);

    const blockedFoldersStr = process.env.RAW_RESOLVER_BLOCKED_FOLDERS || "";
    const blockedFolders = blockedFoldersStr.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);

    // Validate path segments against allowed folders whitelist
    if (allowedFolders.length > 0 && pathSegments.length > 0) {
      const firstSegment = pathSegments[0].toLowerCase();
      if (!allowedFolders.includes(firstSegment)) {
        return new NextResponse(`Access denied: Resource '${pathSegments[0]}' is not whitelisted.`, { status: 403 });
      }
    }

    // Validate path segments against blocked folders blacklist
    if (blockedFolders.length > 0 && pathSegments.length > 0) {
      for (const segment of pathSegments) {
        if (blockedFolders.includes(segment.toLowerCase())) {
          return new NextResponse(`Access denied: Folder '${segment}' is blacklisted for raw access.`, { status: 403 });
        }
      }
    }

    // If path is empty, list root directory contents
    if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === "")) {
      let subFolders = await prisma.folder.findMany({
        where: { userId: user.id, parentId: null, deletedAt: null },
      });
      let subFiles = await prisma.file.findMany({
        where: { userId: user.id, folderId: null, status: "active" },
      });

      // Filter subfolders based on whitelist
      if (allowedFolders.length > 0) {
        subFolders = subFolders.filter(f => allowedFolders.includes(f.name.toLowerCase()));
        subFiles = []; // Hide files at root if folder whitelist is active
      }

      // Filter subfolders based on blacklist
      if (blockedFolders.length > 0) {
        subFolders = subFolders.filter(f => !blockedFolders.includes(f.name.toLowerCase()));
      }

      return NextResponse.json({
        type: "directory",
        name: "root",
        id: null,
        folders: subFolders.map(f => ({ id: f.id, name: f.name, type: "folder" })),
        files: subFiles.map(f => ({ id: f.id, name: f.name, size: f.sizeBytes.toString(), mime: f.mimeType, type: "file" })),
      });
    }

    // Traverse directory structure segment-by-segment
    let currentParentId: string | null = null;
    for (let i = 0; i < pathSegments.length - 1; i++) {
      const segmentName = pathSegments[i];
      const folder = await prisma.folder.findFirst({
        where: {
          userId: user.id,
          name: segmentName,
          parentId: currentParentId,
          deletedAt: null,
        },
      });

      if (!folder) {
        return NextResponse.json({ error: `Directory not found: ${segmentName}` }, { status: 404 });
      }
      currentParentId = folder.id;
    }

    const lastSegment = pathSegments[pathSegments.length - 1];

    // 1. Try to find an active file with this name in current folder
    const file = await prisma.file.findFirst({
      where: {
        userId: user.id,
        name: lastSegment,
        folderId: currentParentId,
        status: "active",
      },
    });

    if (file) {
      // Check file extension filters
      const ext = file.name.includes(".") 
        ? file.name.substring(file.name.lastIndexOf(".") + 1).toLowerCase() 
        : "";

      const allowedExtsStr = process.env.RAW_RESOLVER_ALLOWED_EXTS || "";
      if (allowedExtsStr.trim() !== "") {
        const allowedExts = allowedExtsStr.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
        if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
          return new NextResponse(`Access denied: File extension '.${ext}' is not whitelisted.`, { status: 403 });
        }
      }

      const blockedExtsStr = process.env.RAW_RESOLVER_BLOCKED_EXTS || "";
      if (blockedExtsStr.trim() !== "") {
        const blockedExts = blockedExtsStr.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
        if (blockedExts.includes(ext)) {
          return new NextResponse(`Access denied: File extension '.${ext}' is blacklisted.`, { status: 403 });
        }
      }

      let stream: Readable;
      try {
        const { StorageCoordinator } = await import("@/services/storage/coordinator");
        stream = await StorageCoordinator.streamFile(file);
      } catch (err: any) {
        return new NextResponse(`Streaming failed: ${err.message}`, { status: 500 });
      }

      const webStream = Readable.toWeb(stream);
      const inline = req.nextUrl.searchParams.get("inline") === "true";
      const disposition = inline
        ? "inline"
        : `attachment; filename="${encodeURIComponent(file.name)}"`;

      return new NextResponse(webStream as any, {
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Content-Length": file.sizeBytes.toString(),
          "Content-Disposition": disposition,
        },
      });
    }

    // 2. Try to find a folder with this name in current folder
    const folder = await prisma.folder.findFirst({
      where: {
        userId: user.id,
        name: lastSegment,
        parentId: currentParentId,
        deletedAt: null,
      },
    });

    if (folder) {
      let subFolders = await prisma.folder.findMany({
        where: { userId: user.id, parentId: folder.id, deletedAt: null },
      });
      const subFiles = await prisma.file.findMany({
        where: { userId: user.id, folderId: folder.id, status: "active" },
      });

      // Filter subfolders based on blacklist
      if (blockedFolders.length > 0) {
        subFolders = subFolders.filter(f => !blockedFolders.includes(f.name.toLowerCase()));
      }

      return NextResponse.json({
        type: "directory",
        name: folder.name,
        id: folder.id,
        folders: subFolders.map(f => ({ id: f.id, name: f.name, type: "folder" })),
        files: subFiles.map(f => ({ id: f.id, name: f.name, size: f.sizeBytes.toString(), mime: f.mimeType, type: "file" })),
      });
    }

    return NextResponse.json({ error: `File or directory not found: ${lastSegment}` }, { status: 404 });
  } catch (err: any) {
    console.error("Raw direct path resolver API error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
