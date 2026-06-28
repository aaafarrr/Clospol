import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const shares = await prisma.fileShare.findMany({
      where: {
        userId: user.id,
        enabled: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        file: true,
        folder: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const formattedShares = shares.map(share => {
      const isFolder = !!share.folderId;
      return {
        id: share.id,
        fileId: share.fileId,
        folderId: share.folderId,
        isFolder,
        fileName: isFolder 
          ? (share.folder ? share.folder.name : "Deleted Folder") 
          : (share.file ? share.file.name : "Deleted File"),
        fileSize: isFolder 
          ? "0" 
          : (share.file ? share.file.sizeBytes.toString() : "0"),
        mimeType: isFolder 
          ? "folder" 
          : (share.file ? share.file.mimeType : "application/octet-stream"),
        token: share.token,
        url: `${appUrl}/public/files/${share.token}`,
        expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
        maxDownloads: share.maxDownloads,
        downloadCount: share.downloadCount,
      };
    });

    return NextResponse.json({ shares: formattedShares });
  } catch (err: any) {
    console.error("GET shared links error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
