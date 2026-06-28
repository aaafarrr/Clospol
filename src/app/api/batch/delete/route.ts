import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

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

    const deleteTime = new Date();
    
    // Resolve all descendants if there are folderIds
    const resolvedFolderIds = folderIds.length > 0 
      ? await getMultipleDescendantFolderIds(folderIds, user.id) 
      : [];

    // Check if any directly selected file is starred
    const starredFilesDirectCount = await prisma.file.count({
      where: {
        userId: user.id,
        id: { in: fileIds },
        isStarred: true
      }
    });

    if (starredFilesDirectCount > 0) {
      return NextResponse.json({ error: "Cannot delete selected items because one or more files are starred." }, { status: 400 });
    }

    if (resolvedFolderIds.length > 0) {
      // Check if any folder is starred
      const starredFoldersCount = await prisma.folder.count({
        where: {
          userId: user.id,
          id: { in: resolvedFolderIds },
          isStarred: true
        }
      });

      if (starredFoldersCount > 0) {
        return NextResponse.json({ error: "Cannot delete selected items because one or more folders are starred." }, { status: 400 });
      }

      // Check if any active file inside these folders is starred
      const starredFilesInsideCount = await prisma.file.count({
        where: {
          userId: user.id,
          folderId: { in: resolvedFolderIds },
          status: "active",
          isStarred: true
        }
      });

      if (starredFilesInsideCount > 0) {
        return NextResponse.json({ error: "Cannot delete selected items because they contain starred files." }, { status: 400 });
      }
    }

    await prisma.$transaction([
      // Soft-delete files directly selected
      prisma.file.updateMany({
        where: {
          userId: user.id,
          id: { in: fileIds },
          status: "active"
        },
        data: {
          status: "deleted",
          deletedAt: deleteTime
        }
      }),
      // Soft-delete files inside selected folders
      prisma.file.updateMany({
        where: {
          userId: user.id,
          folderId: { in: resolvedFolderIds },
          status: "active"
        },
        data: {
          status: "deleted",
          deletedAt: deleteTime
        }
      }),
      // Soft-delete folders and descendants
      prisma.folder.updateMany({
        where: {
          userId: user.id,
          id: { in: resolvedFolderIds }
        },
        data: {
          deletedAt: deleteTime
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Batch delete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
