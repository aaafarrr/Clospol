import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const folder = await prisma.folder.findFirst({
      where: { id, userId: user.id, deletedAt: null }
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { isStarred: !folder.isStarred }
    });

    return NextResponse.json({ status: "ok", isStarred: updated.isStarred });
  } catch (err: any) {
    console.error("Star folder error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
