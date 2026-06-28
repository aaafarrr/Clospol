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

    const resolvedFolderIds = folderIds.length > 0 
      ? await getMultipleDescendantFolderIds(folderIds, user.id) 
      : [];

    await prisma.$transaction([
      prisma.file.updateMany({
        where: {
          userId: user.id,
          id: { in: fileIds },
          status: "deleted"
        },
        data: {
          status: "active",
          deletedAt: null
        }
      }),
      prisma.file.updateMany({
        where: {
          userId: user.id,
          folderId: { in: resolvedFolderIds },
          status: "deleted"
        },
        data: {
          status: "active",
          deletedAt: null
        }
      }),
      prisma.folder.updateMany({
        where: {
          userId: user.id,
          id: { in: resolvedFolderIds }
        },
        data: {
          deletedAt: null
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Batch restore error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
