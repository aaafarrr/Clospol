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

    const schedule = await prisma.databaseBackupSchedule.findFirst({
      where: { id, userId: user.id },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    await prisma.databaseBackupSchedule.delete({ where: { id: schedule.id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE backup schedule error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
