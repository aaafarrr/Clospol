import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const rule = await prisma.autoTieringRule.findFirst({
      where: { id, userId: user.id },
    });

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await prisma.autoTieringRule.delete({ where: { id: rule.id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE auto-tiering rule error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
