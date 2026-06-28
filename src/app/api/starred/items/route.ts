import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        status: "active",
        isStarred: true,
        deletedAt: null
      },
      orderBy: { updatedAt: "desc" }
    });

    const folders = await prisma.folder.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        isStarred: true
      },
      orderBy: { updatedAt: "desc" }
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
    console.error("GET starred items error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
