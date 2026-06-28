import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const camera = await prisma.cctvCamera.findFirst({
      where: { id, userId: user.id },
    });

    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }

    const rootFolder = await prisma.folder.findFirst({
      where: {
        userId: user.id,
        parentId: null,
        name: "CCTV Recordings",
        deletedAt: null,
      },
    });

    if (!rootFolder) {
      return NextResponse.json({ files: [] });
    }

    const cameraFolder = await prisma.folder.findFirst({
      where: {
        userId: user.id,
        parentId: rootFolder.id,
        name: camera.name,
        deletedAt: null,
      },
    });

    if (!cameraFolder) {
      return NextResponse.json({ files: [] });
    }

    const monthFolders = await prisma.folder.findMany({
      where: {
        userId: user.id,
        parentId: cameraFolder.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    const folderIds = [cameraFolder.id, ...monthFolders.map((f) => f.id)];

    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        folderId: { in: folderIds },
        status: "active",
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedFiles = files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
      createdAt: file.createdAt.toISOString(),
      downloadUrl: `/api/files/${file.id}/download`,
      viewUrl: `/api/files/${file.id}/download?inline=true`,
    }));

    return NextResponse.json({ files: formattedFiles });
  } catch (err: any) {
    console.error("GET CCTV camera gallery error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
