import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";
import { StorageUploaderService } from "@/services/storage/uploader";
import AdmZip from "adm-zip";

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    zip: "application/zip",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    csv: "text/csv",
    xml: "text/xml",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext || ""] || "application/octet-stream";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: fileId } = await params;

    // 1. Fetch ZIP file metadata from DB
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: user.id, status: "active" },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const isZip = file.name.toLowerCase().endsWith(".zip") || file.mimeType === "application/zip";
    if (!isZip) {
      return NextResponse.json({ error: "Only ZIP files can be extracted." }, { status: 400 });
    }

    // 2. Fetch the connected storage account
    const storageAccount = await prisma.connectedAccount.findFirst({
      where: { id: file.connectedAccountId, userId: user.id, status: "connected" },
    });

    if (!storageAccount) {
      return NextResponse.json({ error: "Connected storage account not found or is disconnected" }, { status: 404 });
    }

    // 3. Open a stream and load files into buffer memory
    let sourceStream: Readable;
    try {
      if (file.provider === "local") {
        sourceStream = LocalStorageService.streamLocalFile(file);
      } else if (file.provider === "s3") {
        sourceStream = await S3StorageService.streamS3File(file);
      } else if (file.provider === "google_drive") {
        sourceStream = await GoogleDriveService.streamGoogleFile(file);
      } else {
        return NextResponse.json({ error: `Unsupported source provider: ${file.provider}` }, { status: 400 });
      }
    } catch (streamErr: any) {
      return NextResponse.json({ error: `Failed to open source stream: ${streamErr.message}` }, { status: 500 });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of sourceStream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const zipBuffer = Buffer.concat(chunks);

    // 4. Parse zip archive
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch (zipErr: any) {
      return NextResponse.json({ error: `Corrupt ZIP file: ${zipErr.message}` }, { status: 400 });
    }

    const zipEntries = zip.getEntries();

    // Helper to resolve/create nested folders path in database
    const getOrCreateFoldersPath = async (entryPath: string, rootFolderId: string | null): Promise<string | null> => {
      const parts = entryPath.split("/").filter(Boolean);
      if (parts.length === 0) return rootFolderId;

      let currentParentId = rootFolderId;

      for (const part of parts) {
        let folder = await prisma.folder.findFirst({
          where: {
            userId: user.id,
            parentId: currentParentId,
            name: part,
            deletedAt: null,
          },
        });

        if (!folder) {
          folder = await prisma.folder.create({
            data: {
              userId: user.id,
              parentId: currentParentId,
              connectedAccountId: file.connectedAccountId,
              provider: file.provider,
              name: part,
            },
          });
        }
        currentParentId = folder.id;
      }
      return currentParentId;
    };

    let extractedFilesCount = 0;
    let extractedFoldersCount = 0;

    for (const entry of zipEntries) {
      const name = entry.entryName;

      // Skip OS files
      if (name.includes("__MACOSX") || name.endsWith(".DS_Store")) {
        continue;
      }

      if (entry.isDirectory) {
        await getOrCreateFoldersPath(name, file.folderId);
        extractedFoldersCount++;
        continue;
      }

      // Parse file name and parent folder path
      const lastSlash = name.lastIndexOf("/");
      const dirPath = lastSlash !== -1 ? name.substring(0, lastSlash) : "";
      const fileName = lastSlash !== -1 ? name.substring(lastSlash + 1) : name;

      if (!fileName) continue;

      const targetFolderId = await getOrCreateFoldersPath(dirPath, file.folderId);
      const fileData = entry.getData();

      // Skip empty virtual directory entry artifacts
      if (fileData.length === 0 && fileName.startsWith(".")) {
        continue;
      }

      const fileStream = Readable.from(fileData);

      // Stream upload each file to the S3/Local/Google Drive storage
      try {
        await StorageUploaderService.uploadAndSaveFile(
          user.id,
          storageAccount,
          fileName,
          getMimeType(fileName),
          fileData.length,
          targetFolderId,
          fileStream
        );
        extractedFilesCount++;
      } catch (uploadErr: any) {
        console.error(`Failed to upload extracted file "${fileName}" from zip:`, uploadErr.message);
      }
    }

    // Log the unzip action
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "unzip",
        entityType: "file",
        entityId: file.id,
        metadata: JSON.stringify({
          name: file.name,
          extractedFiles: extractedFilesCount,
          extractedFolders: extractedFoldersCount,
        }),
      },
    });

    return NextResponse.json({
      message: `ZIP archive "${file.name}" extracted successfully. Created ${extractedFilesCount} files and ${extractedFoldersCount} virtual folders.`,
      extractedFiles: extractedFilesCount,
      extractedFolders: extractedFoldersCount,
    });

  } catch (err: any) {
    console.error("ZIP unzip error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
