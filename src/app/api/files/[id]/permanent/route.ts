import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

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
      where: { id, userId: user.id, status: "deleted" },
      include: { connectedAccount: true }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found in trash" }, { status: 404 });
    }

    // Delete from physical storage
    try {
      const { StorageCoordinator } = await import("@/services/storage/coordinator");
      await StorageCoordinator.deleteFile(file);
    } catch (err: any) {
      console.warn(`Physical deletion failed for file ${file.id}: ${err.message}`);
    }

    // Delete database entry
    await prisma.file.delete({ where: { id: file.id } });

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Permanent delete file error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
