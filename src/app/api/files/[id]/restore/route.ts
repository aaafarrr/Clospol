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

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:delete")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:delete' is required" }, { status: 403 });
      }
    }

    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: { id, userId: user.id, status: "deleted" }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found in trash" }, { status: 404 });
    }

    await prisma.file.update({
      where: { id: file.id },
      data: { status: "active", deletedAt: null }
    });

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Restore file error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
