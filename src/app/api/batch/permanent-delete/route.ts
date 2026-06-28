import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

async function getMultipleDescendantFolderIds(rootIds: string[], userId: string): Promise<string[]> {
  const allFolders = await prisma.folder.findMany({
    where: { userId },
    select: { id: true, parentId: true }
  });

  const descendantIds = [...rootIds];
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

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { fileIds = [], folderIds = [] } = await req.json();

    if (fileIds.length === 0 && folderIds.length === 0) {
      return NextResponse.json({ error: "No items specified" }, { status: 400 });
    }

    const resolvedFolderIds = folderIds.length > 0 
      ? await getMultipleDescendantFolderIds(folderIds, user.id) 
      : [];

    // Find all files that will be deleted
    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        OR: [
          { id: { in: fileIds } },
          { folderId: { in: resolvedFolderIds } }
        ]
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
        console.warn(`Physical deletion failed during batch delete for file ${file.id}: ${err.message}`);
      }
    }

    // Delete from DB in transaction
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
          id: { in: resolvedFolderIds }
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Batch permanent delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
