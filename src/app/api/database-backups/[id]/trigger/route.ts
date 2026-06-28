import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { DatabaseBackupService } from "@/services/database-backup";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const schedule = await prisma.databaseBackupSchedule.findFirst({
      where: { id, userId: user.id },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Backup schedule not found" }, { status: 404 });
    }

    await DatabaseBackupService.runBackup(schedule);

    const updatedSchedule = await prisma.databaseBackupSchedule.findUnique({
      where: { id: schedule.id },
    });

    if (updatedSchedule?.lastBackupStatus === "success") {
      return NextResponse.json({
        status: "ok",
        message: "Database backup completed and uploaded successfully.",
      });
    } else {
      return NextResponse.json(
        {
          status: "error",
          error: updatedSchedule?.lastBackupError || "Backup execution failed.",
        },
        { status: 400 }
      );
    }
  } catch (err: any) {
    console.error("Database backup trigger error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
