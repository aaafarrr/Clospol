import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

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

export async function POST(
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

    // Run transaction to restore folders and files
    await prisma.$transaction([
      prisma.file.updateMany({
        where: {
          userId: user.id,
          status: "deleted",
          folderId: { in: folderIds }
        },
        data: {
          status: "active",
          deletedAt: null
        }
      }),
      prisma.folder.updateMany({
        where: {
          userId: user.id,
          id: { in: folderIds }
        },
        data: {
          deletedAt: null
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Restore folder error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
