import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      fileCount,
      folderCount,
      accountsCount,
      messengerCount,
      backupCount,
      cctvCount,
      apiKeyCount,
    ] = await Promise.all([
      prisma.file.count({
        where: {
          userId: user.id,
          status: "active",
          deletedAt: null,
        },
      }),
      prisma.folder.count({
        where: {
          userId: user.id,
          deletedAt: null,
        },
      }),
      prisma.connectedAccount.count({
        where: {
          userId: user.id,
          status: "connected",
        },
      }),
      prisma.messengerIntegration.count({
        where: {
          userId: user.id,
          isActive: true,
        },
      }),
      prisma.databaseBackupSchedule.count({
        where: {
          userId: user.id,
          status: "active",
        },
      }),
      prisma.cctvCamera.count({
        where: {
          userId: user.id,
          status: "active",
        },
      }),
      prisma.apiKey.count({
        where: {
          userId: user.id,
          status: "active",
        },
      }),
    ]);

    return NextResponse.json({
      fileCount,
      folderCount,
      accountsCount,
      messengerCount,
      backupCount,
      cctvCount,
      apiKeyCount,
    });
  } catch (err: any) {
    console.error("GET dashboard stats error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
