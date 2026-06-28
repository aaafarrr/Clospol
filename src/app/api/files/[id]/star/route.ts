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
      if (!scopes.includes("files:upload")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:upload' is required" }, { status: 403 });
      }
    }

    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: { id, userId: user.id, status: "active" }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { isStarred: !file.isStarred }
    });

    return NextResponse.json({ status: "ok", isStarred: updated.isStarred });
  } catch (err: any) {
    console.error("Star file error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
