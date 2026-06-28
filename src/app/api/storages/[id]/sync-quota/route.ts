import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const account = await prisma.connectedAccount.findFirst({
      where: { id, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Connected account not found" }, { status: 404 });
    }

    let quota;
    if (account.provider === "local") {
      quota = await LocalStorageService.syncLocalQuota(account.id);
    } else if (account.provider === "s3") {
      quota = await S3StorageService.syncS3Quota(account.id);
    } else {
      quota = await GoogleDriveService.syncGoogleQuota(account);
    }

    return NextResponse.json({
      quota: {
        id: quota.id,
        connected_account_id: quota.connectedAccountId,
        totalBytes: quota.totalBytes !== null ? quota.totalBytes.toString() : null,
        usedBytes: quota.usedBytes.toString(),
        availableBytes: quota.availableBytes !== null ? quota.availableBytes.toString() : null,
        trashBytes: quota.trashBytes !== null ? quota.trashBytes.toString() : null,
        lastSyncedAt: quota.lastSyncedAt ? quota.lastSyncedAt.toISOString() : null,
      },
    });

  } catch (err: any) {
    console.error("Sync quota error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
