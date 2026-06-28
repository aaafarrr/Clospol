import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { verifyToken } from "@/lib/jwt";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

async function isFileInsideFolder(rootFolderId: string, fileFolderId: string | null): Promise<boolean> {
  let currentId: string | null = fileFolderId;
  let depth = 0;
  while (currentId && depth < 20) {
    if (currentId === rootFolderId) return true;
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
    });

    if (!share) {
      return new NextResponse("Share link not found", { status: 404 });
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return new NextResponse("Share link has expired", { status: 410 });
    }

    // Password validation
    if (share.passwordHash) {
      const cookieVal = req.cookies.get(`unlocked_share_${share.id}`)?.value;
      if (!cookieVal) {
        return new NextResponse("Password verification required", { status: 401 });
      }
      const decoded = verifyToken(cookieVal);
      if (!decoded || decoded.shareId !== share.id) {
        return new NextResponse("Invalid security verification token", { status: 401 });
      }
    }

    let file;
    if (share.fileId) {
      if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
        return new NextResponse("Download limit reached", { status: 403 });
      }
      file = await prisma.file.findUnique({
        where: { id: share.fileId },
      });
    } else if (share.folderId) {
      // Get fileId from searchParams
      const { searchParams } = new URL(req.url);
      const fileId = searchParams.get("fileId");
      if (!fileId) {
        return new NextResponse("File ID required for folder share download", { status: 400 });
      }

      const targetFile = await prisma.file.findUnique({
        where: { id: fileId, status: "active", deletedAt: null },
      });

      if (!targetFile) {
        return new NextResponse("File not found", { status: 404 });
      }

      // Verify file is inside the shared folder
      const isInside = targetFile.folderId === share.folderId || await isFileInsideFolder(share.folderId, targetFile.folderId);
      if (!isInside) {
        return new NextResponse("Access Denied", { status: 403 });
      }

      file = targetFile;
    }

    if (!file) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Stream download attachment to browser
    let sourceStream: Readable;
    if (file.provider === "local") {
      sourceStream = LocalStorageService.streamLocalFile(file);
    } else if (file.provider === "s3") {
      sourceStream = await S3StorageService.streamS3File(file);
    } else if (file.provider === "google_drive") {
      sourceStream = await GoogleDriveService.streamGoogleFile(file);
    } else {
      return new NextResponse("Unsupported file provider", { status: 400 });
    }

    // Increment download count
    await prisma.fileShare.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Log the download activity
    await prisma.auditLog.create({
      data: {
        userId: share.userId,
        action: "public_download",
        entityType: "file",
        entityId: file.id,
        metadata: JSON.stringify({
          name: file.name,
          shareId: share.id,
          ip: req.headers.get("x-forwarded-for") || (req as any).ip || "unknown",
        }),
      },
    });

    const webStream = Readable.toWeb(sourceStream);

    return new NextResponse(webStream as any, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": file.sizeBytes.toString(),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      },
    });

  } catch (err: any) {
    console.error("Share download stream error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
