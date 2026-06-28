import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

async function checkFileAccess(fileId: string, userId: string, email: string): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, userId: true, folderId: true },
  });
  if (!file) return false;
  if (file.userId === userId) return true;

  const directInvite = await prisma.workspaceInvite.findFirst({
    where: {
      inviteeEmail: email.toLowerCase(),
      targetType: "file",
      targetId: fileId,
      status: "accepted",
    },
  });
  if (directInvite) return true;

  if (file.folderId) {
    let folderId: string | null = file.folderId;
    let depth = 0;
    while (folderId && depth < 10) {
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { id: true, userId: true, parentId: true },
      });
      if (!folder) break;
      if (folder.userId === userId) return true;

      const folderInvite = await prisma.workspaceInvite.findFirst({
        where: {
          inviteeEmail: email.toLowerCase(),
          targetType: "folder",
          targetId: folderId,
          status: "accepted",
        },
      });
      if (folderInvite) return true;

      folderId = folder.parentId;
      depth++;
    }
  }

  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return new NextResponse("Unauthorized", { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:read")) {
        return new NextResponse("Forbidden: scope 'files:read' is required", { status: 403 });
      }
    }

    const { id } = await params;

    const hasAccess = await checkFileAccess(id, user.id, user.email);
    if (!hasAccess) {
      return new NextResponse("File not found or access denied", { status: 404 });
    }

    const file = await prisma.file.findFirst({
      where: { id },
    });

    if (!file) {
      return new NextResponse("File not found", { status: 404 });
    }

    let stream: Readable;
    try {
      const { StorageCoordinator } = await import("@/services/storage/coordinator");
      stream = await StorageCoordinator.streamFile(file);
    } catch (err: any) {
      return new NextResponse(`Download failed: ${err.message}`, { status: 500 });
    }

    const webStream = Readable.toWeb(stream);

    const inline = req.nextUrl.searchParams.get("inline") === "true";
    const disposition = inline
      ? "inline"
      : `attachment; filename="${encodeURIComponent(file.name)}"`;

    return new NextResponse(webStream as any, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": file.sizeBytes.toString(),
        "Content-Disposition": disposition,
      },
    });
  } catch (err: any) {
    console.error("GET file download error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
