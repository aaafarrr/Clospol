import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { ActivityLogger } from "@/lib/audit";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:upload")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:upload' is required" }, { status: 403 });
      }
    }

    const { id } = await params;
    const { name, color, parentId } = await req.json();

    const folder = await prisma.folder.findFirst({
      where: { id, userId: user.id, deletedAt: null }
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const cleanParentId = parentId !== undefined 
      ? (parentId === "null" || parentId === "" || parentId === null ? null : parentId)
      : undefined;

    if (cleanParentId !== undefined) {
      if (cleanParentId === id) {
        return NextResponse.json({ error: "Folder cannot be moved into itself" }, { status: 400 });
      }

      if (cleanParentId) {
        const parent = await prisma.folder.findFirst({
          where: { id: cleanParentId, userId: user.id, deletedAt: null }
        });
        if (!parent) {
          return NextResponse.json({ error: "Parent folder not found" }, { status: 400 });
        }

        const descendants = await getDescendantFolderIds(id, user.id);
        if (descendants.includes(cleanParentId)) {
          return NextResponse.json({ error: "Folder cannot be moved into a child of itself" }, { status: 400 });
        }
      }
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: {
        name: name !== undefined ? name : folder.name,
        color: color !== undefined ? color : folder.color,
        parentId: cleanParentId !== undefined ? cleanParentId : folder.parentId,
      }
    });

    return NextResponse.json({ folder: updated });
  } catch (err: any) {
    console.error("PATCH folder error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:delete")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:delete' is required" }, { status: 403 });
      }
    }

    const { id } = await params;

    const rootFolder = await prisma.folder.findFirst({
      where: { id, userId: user.id, deletedAt: null }
    });

    if (!rootFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const folderIds = await getDescendantFolderIds(rootFolder.id, user.id);

    // Check if the root folder or any descendant folder is starred
    const starredFoldersCount = await prisma.folder.count({
      where: {
        userId: user.id,
        id: { in: folderIds },
        isStarred: true
      }
    });

    if (starredFoldersCount > 0) {
      return NextResponse.json({ error: "Cannot delete folder because it or one of its subfolders is starred. Unstar them first." }, { status: 400 });
    }

    // Check if any active file inside these folders is starred
    const starredFilesCount = await prisma.file.count({
      where: {
        userId: user.id,
        folderId: { in: folderIds },
        status: "active",
        isStarred: true
      }
    });

    if (starredFilesCount > 0) {
      return NextResponse.json({ error: "Cannot delete folder because it contains starred files. Unstar them first." }, { status: 400 });
    }

    const deleteTime = new Date();

    await prisma.$transaction([
      prisma.file.updateMany({
        where: {
          userId: user.id,
          status: "active",
          folderId: { in: folderIds }
        },
        data: {
          status: "deleted",
          deletedAt: deleteTime
        }
      }),
      prisma.folder.updateMany({
        where: {
          userId: user.id,
          id: { in: folderIds }
        },
        data: {
          deletedAt: deleteTime
        }
      })
    ]);

    await ActivityLogger.log("delete_folder", "folder", rootFolder.id, { name: rootFolder.name }, user.id);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("DELETE folder error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
