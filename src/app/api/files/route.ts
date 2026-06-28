import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { StorageUploaderService } from "@/services/storage/uploader";
import { UploadRoutingService } from "@/services/storage/routing";

async function checkFolderAccess(folderId: string, userId: string, email: string): Promise<boolean> {
  let currentId: string | null = folderId;
  let depth = 0;
  while (currentId && depth < 10) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, userId: true, parentId: true },
    });
    if (!folder) return false;
    if (folder.userId === userId) return true;

    const folderInvite = await prisma.workspaceInvite.findFirst({
      where: {
        inviteeEmail: email.toLowerCase(),
        targetType: "folder",
        targetId: currentId,
        status: "accepted",
      },
    });
    if (folderInvite) return true;

    currentId = folder.parentId;
    depth++;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:read")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:read' is required" }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId") || null;
    const isRoot = folderId === "" || folderId === "null" || folderId === null;

    let files;
    if (isRoot) {
      files = await prisma.file.findMany({
        where: {
          userId: user.id,
          folderId: null,
          status: "active",
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      const hasAccess = await checkFolderAccess(folderId, user.id, user.email);
      if (!hasAccess) {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
      }

      files = await prisma.file.findMany({
        where: {
          folderId,
          status: "active",
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    const formattedFiles = files.map(file => ({
      ...file,
      sizeBytes: file.sizeBytes.toString(),
    }));

    return NextResponse.json({ files: formattedFiles });
  } catch (err: any) {
    console.error("GET files error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:upload")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:upload' is required" }, { status: 403 });
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as any;
    const folderId = formData.get("folderId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const size = buffer.length;
    const stream = Readable.from(buffer);

    // Resolve storage account destination
    const storageAccount = await UploadRoutingService.selectRoutingAccount(user.id, size);
    if (!storageAccount) {
      return NextResponse.json({ error: "No active storage account resolved." }, { status: 507 });
    }

    const savedFile = await StorageUploaderService.uploadAndSaveFile(
      user.id,
      storageAccount,
      file.name,
      file.type || "application/octet-stream",
      size,
      folderId === "" || folderId === "null" ? null : folderId,
      stream,
      user._apiKey ? { id: user._apiKey.id, name: user._apiKey.name } : undefined
    );

    return NextResponse.json({
      file: {
        ...savedFile,
        sizeBytes: savedFile.sizeBytes.toString(),
      }
    }, { status: 201 });
  } catch (err: any) {
    console.error("POST files error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
