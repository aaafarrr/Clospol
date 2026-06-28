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

    const { fileIds = [], folderIds = [], targetFolderId = null } = await req.json();

    if (fileIds.length === 0 && folderIds.length === 0) {
      return NextResponse.json({ error: "No items specified" }, { status: 400 });
    }

    // Validate target folder
    const destinationId = targetFolderId === "" || targetFolderId === "null" ? null : targetFolderId;
    if (destinationId) {
      const targetFolder = await prisma.folder.findFirst({
        where: { id: destinationId, userId: user.id, deletedAt: null }
      });
      if (!targetFolder) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 400 });
      }

      // Check loop: cannot move any folder into itself or its descendants
      const descendants = await getMultipleDescendantFolderIds(folderIds, user.id);
      if (descendants.includes(destinationId)) {
        return NextResponse.json({ error: "Cannot move a folder into itself or its subdirectories" }, { status: 400 });
      }
    }

    await prisma.$transaction([
      prisma.file.updateMany({
        where: {
          userId: user.id,
          id: { in: fileIds },
          status: "active"
        },
        data: {
          folderId: destinationId
        }
      }),
      prisma.folder.updateMany({
        where: {
          userId: user.id,
          id: { in: folderIds }
        },
        data: {
          parentId: destinationId
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Batch move error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
