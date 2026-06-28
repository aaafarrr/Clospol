import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

async function getDescendantFolderIds(rootId: string, userId: string): Promise<string[]> {
  const allFolders = await prisma.folder.findMany({
    where: { userId },
    select: { id: true, parentId: true }
  });

  const descendantIds = [rootId];
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of allFolders) {
      if (folder.parentId && descendantIds.includes(folder.parentId) && !descendantIds.includes(folder.id)) {
        descendantIds.push(folder.id);
        changed = true;
      }
    }
  }
  return descendantIds;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const rootFolder = await prisma.folder.findFirst({
      where: { id, userId: user.id, NOT: { deletedAt: null } }
    });

    if (!rootFolder) {
      return NextResponse.json({ error: "Folder not found in trash" }, { status: 404 });
    }

    const folderIds = await getDescendantFolderIds(rootFolder.id, user.id);

    // Find all files in these folders
    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        folderId: { in: folderIds }
      },
      include: { connectedAccount: true }
    });

    // Delete files physically
    for (const file of files) {
      try {
        if (file.provider === "local") {
          await LocalStorageService.deleteLocalFile(file);
        } else if (file.provider === "s3") {
          await S3StorageService.deleteS3Object(file);
        } else if (file.provider === "google_drive") {
          await GoogleDriveService.deleteGoogleFile(file);
        }
      } catch (err: any) {
        console.warn(`Physical deletion failed during folder delete for file ${file.id}: ${err.message}`);
      }
    }

    // Delete folders and files from db
    await prisma.$transaction([
      prisma.file.deleteMany({
        where: {
          userId: user.id,
          id: { in: files.map(f => f.id) }
        }
      }),
      prisma.folder.deleteMany({
        where: {
          userId: user.id,
          id: { in: folderIds }
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Permanent delete folder error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
