import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { TrashCleanupService } from "@/services/storage/cleanup";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Clean up expired items (older than 30 days) before listing
    await TrashCleanupService.runCleanup();

    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        status: "deleted",
        NOT: { deletedAt: null }
      },
      orderBy: { deletedAt: "desc" }
    });

    const folders = await prisma.folder.findMany({
      where: {
        userId: user.id,
        NOT: { deletedAt: null }
      },
      orderBy: { deletedAt: "desc" }
    });

    const formattedFiles = files.map(file => ({
      ...file,
      sizeBytes: file.sizeBytes.toString(),
    }));

    return NextResponse.json({
      files: formattedFiles,
      folders
    });
  } catch (err: any) {
    console.error("GET trash items error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
