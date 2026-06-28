import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";
import { Readable } from "stream";

// Helper to get stream as buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// Recursive helper to traverse folders and gather files with relative paths
async function gatherFilesToZip(
  folderId: string | null,
  currentPath: string,
  userId: string,
  result: { file: any; relativePath: string }[]
) {
  // Find all active files in current folder
  const files = await prisma.file.findMany({
    where: { userId, folderId, status: "active" }
  });

  for (const file of files) {
    result.push({
      file,
      relativePath: currentPath ? `${currentPath}/${file.name}` : file.name
    });
  }

  // Find child folders
  const folders = await prisma.folder.findMany({
    where: { userId, parentId: folderId, deletedAt: null }
  });

  for (const folder of folders) {
    const nextPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
    await gatherFilesToZip(folder.id, nextPath, userId, result);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { fileIds = [], folderIds = [] } = await req.json();

    if (fileIds.length === 0 && folderIds.length === 0) {
      return NextResponse.json({ error: "No items specified" }, { status: 400 });
    }

    const itemsToZip: { file: any; relativePath: string }[] = [];

    // Gather direct files
    const directFiles = await prisma.file.findMany({
      where: {
        userId: user.id,
        id: { in: fileIds },
        status: "active"
      }
    });

    for (const file of directFiles) {
      itemsToZip.push({ file, relativePath: file.name });
    }

    // Gather folders recursively
    const directFolders = await prisma.folder.findMany({
      where: {
        userId: user.id,
        id: { in: folderIds },
        deletedAt: null
      }
    });

    for (const folder of directFolders) {
      await gatherFilesToZip(folder.id, folder.name, user.id, itemsToZip);
    }

    if (itemsToZip.length === 0) {
      return NextResponse.json({ error: "No files found to archive" }, { status: 400 });
    }

    const zip = new AdmZip();

    // Stream and add each file to the zip
    for (const item of itemsToZip) {
      try {
        const file = item.file;
        let fileStream: Readable;

        if (file.provider === "local") {
          fileStream = LocalStorageService.streamLocalFile(file);
        } else if (file.provider === "s3") {
          fileStream = await S3StorageService.streamS3File(file);
        } else if (file.provider === "google_drive") {
          fileStream = await GoogleDriveService.streamGoogleFile(file);
        } else {
          continue;
        }

        const buffer = await streamToBuffer(fileStream);
        zip.addFile(item.relativePath, buffer);
      } catch (err: any) {
        console.warn(`Failed to add file ${item.file.name} to zip: ${err.message}`);
      }
    }

    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="clospol-download.zip"',
        "Content-Length": zipBuffer.length.toString()
      }
    });
  } catch (err: any) {
    console.error("Batch zip error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
