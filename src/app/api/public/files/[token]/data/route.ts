import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { verifyToken } from "@/lib/jwt";

async function isFolderDescendant(rootId: string, folderId: string): Promise<boolean> {
  let currentId: string | null = folderId;
  let depth = 0;
  while (currentId && depth < 20) {
    if (currentId === rootId) return true;
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    });
    if (!folder) break;
    currentId = folder.parentId;
    depth++;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const share = await prisma.fileShare.findFirst({
      where: { tokenHash, enabled: true },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        folder: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          }
        }
      },
    });

    if (!share) {
      return NextResponse.json({ error: "Share link not found or disabled" }, { status: 404 });
    }

    // Expiry check
    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 410 });
    }

    // Download limit check (for files)
    if (share.fileId && share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
      return NextResponse.json({ error: "Download limit has been reached" }, { status: 403 });
    }

    const isFolder = !!share.folderId;
    const passwordRequired = share.passwordHash !== null;
    let locked = passwordRequired;

    if (passwordRequired) {
      const cookieName = `unlocked_share_${share.id}`;
      const cookieVal = req.cookies.get(cookieName)?.value;
      if (cookieVal) {
        const decoded = verifyToken(cookieVal);
        if (decoded && decoded.shareId === share.id) {
          locked = false;
        }
      }
    }

    const name = isFolder 
      ? (share.folder ? share.folder.name : "Deleted Folder")
      : (share.file ? share.file.name : "Deleted File");

    if (locked) {
      return NextResponse.json({
        locked: true,
        shareId: share.id,
        fileName: name,
        isFolder,
      });
    }

    // Unlocked logic
    if (isFolder) {
      const rootFolderId = share.folderId as string;
      const { searchParams } = new URL(req.url);
      let targetFolderId = searchParams.get("folderId") || rootFolderId;

      // If client requests using the share link ID, map it back to the root folder ID
      if (targetFolderId === share.id) {
        targetFolderId = rootFolderId;
      }

      // Verify that the requested folderId is indeed a descendant of the root shared folder
      const authorized = targetFolderId === rootFolderId || await isFolderDescendant(rootFolderId, targetFolderId);
      if (!authorized) {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
      }

      // Fetch folder contents
      const subFolders = await prisma.folder.findMany({
        where: { parentId: targetFolderId, deletedAt: null },
        select: { id: true, name: true, color: true, createdAt: true },
        orderBy: { name: "asc" }
      });

      const childFiles = await prisma.file.findMany({
        where: { folderId: targetFolderId, status: "active", deletedAt: null },
        select: { id: true, name: true, mimeType: true, sizeBytes: true, createdAt: true },
        orderBy: { name: "asc" }
      });

      const childFilesFormatted = childFiles.map(file => ({
        ...file,
        sizeBytes: file.sizeBytes.toString(),
      }));

      // Resolve breadcrumbs inside the shared folder
      const breadcrumbs: Array<{ id: string; name: string }> = [];
      let currentId: string | null = targetFolderId;
      let depth = 0;
      while (currentId && depth < 20) {
        const f = await prisma.folder.findUnique({
          where: { id: currentId },
          select: { id: true, name: true, parentId: true }
        });
        if (!f) break;
        breadcrumbs.unshift({ id: f.id, name: f.name });
        if (f.id === rootFolderId) break;
        currentId = f.parentId;
        depth++;
      }

      return NextResponse.json({
        locked: false,
        shareId: share.id,
        fileName: name,
        isFolder: true,
        subFolders,
        files: childFilesFormatted,
        breadcrumbs,
        expiresAt: share.expiresAt,
        downloadCount: share.downloadCount,
      });
    } else {
      return NextResponse.json({
        locked: false,
        shareId: share.id,
        fileName: name,
        isFolder: false,
        mimeType: share.file.mimeType,
        sizeBytes: share.file.sizeBytes.toString(),
        createdAt: share.file.createdAt,
        expiresAt: share.expiresAt,
        maxDownloads: share.maxDownloads,
        downloadCount: share.downloadCount,
      });
    }

  } catch (err: any) {
    console.error("Public share data error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
