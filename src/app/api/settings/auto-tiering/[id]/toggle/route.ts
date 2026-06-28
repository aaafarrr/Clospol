import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function PATCH(
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

    const nextStatus = rule.status === "active" ? "inactive" : "active";

    await prisma.autoTieringRule.update({
      where: { id: rule.id },
      data: { status: nextStatus },
    });

    return NextResponse.json({ success: true, status: nextStatus });
  } catch (err: any) {
    console.error("PATCH auto-tiering rule status error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
