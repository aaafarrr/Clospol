import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { ActivityLogger } from "@/lib/audit";

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
    const { name, folderId } = await req.json();

    const file = await prisma.file.findFirst({
      where: { id, userId: user.id, status: "active" }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (folderId !== undefined && folderId !== null && folderId !== "" && folderId !== "null") {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: user.id, deletedAt: null }
      });
      if (!folder) {
        return NextResponse.json({ error: "Target folder not found" }, { status: 400 });
      }
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: {
        name: name !== undefined ? name : file.name,
        folderId: folderId !== undefined ? (folderId === "" || folderId === "null" || folderId === null ? null : folderId) : file.folderId
      }
    });

    return NextResponse.json({ file: { ...updated, sizeBytes: updated.sizeBytes.toString() } });
  } catch (err: any) {
    console.error("PATCH file error:", err);
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

    const file = await prisma.file.findFirst({
      where: { id, userId: user.id, status: "active" },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.isStarred) {
      return NextResponse.json({ error: "Starred files cannot be deleted. Unstar the file first." }, { status: 400 });
    }

    // Soft delete database entry
    await prisma.file.update({
      where: { id: file.id },
      data: {
        status: "deleted",
        deletedAt: new Date()
      }
    });

    // Log activity
    await ActivityLogger.log("delete_file", "file", file.id, { name: file.name }, user.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE file error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
