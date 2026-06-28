import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt, generateSecureToken } from "@/lib/crypto";
import { LocalStorageService } from "@/services/storage/local";
import crypto from "crypto";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, path: dirPath, quotaBytes } = body;

    if (!name || !dirPath) {
      return NextResponse.json({ error: "Name and Directory Path are required" }, { status: 400 });
    }

    const providerAccountId = `local:${crypto.createHash("md5").update(dirPath).digest("hex")}`;

    // Get active provider config if exists
    const providerConfig = await prisma.providerConfig.findFirst({
      where: { provider: "google_drive", status: "active" },
    });
    const providerConfigId = providerConfig ? providerConfig.id : null;

    // Test connection first
    try {
      await LocalStorageService.testLocalConnection(dirPath);
    } catch (testErr: any) {
      return NextResponse.json({ code: "LOCAL_CONNECTION_FAILED", message: testErr.message }, { status: 400 });
    }

    // Check for existing account
    let account = await prisma.connectedAccount.findFirst({
      where: {
        userId: user.id,
        provider: "local",
        providerAccountId,
      },
    });

    const parsedQuotaBytes = quotaBytes ? BigInt(quotaBytes) : null;
    const pathBasename = path.basename(dirPath);

    if (account) {
      // Update
      account = await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          displayName: name,
          email: `Local Storage (${pathBasename})`,
          status: "connected",
        },
      });

      await prisma.localStorageConfig.updateMany({
        where: { connectedAccountId: account.id },
        data: {
          name,
          serverPath: dirPath,
          quotaBytes: parsedQuotaBytes,
        },
      });
    } else {
      // Create
      account = await prisma.connectedAccount.create({
        data: {
          userId: user.id,
          providerConfigId,
          provider: "local",
          providerAccountId,
          email: `Local Storage (${pathBasename})`,
          displayName: name,
          accessTokenEncrypted: encrypt("local"),
          refreshTokenEncrypted: encrypt(generateSecureToken()),
          tokenExpiresAt: new Date(Date.now() + 100 * 365 * 24 * 60 * 65000), // 100 years
          scopes: JSON.stringify([]),
          status: "connected",
        },
      });

      await prisma.localStorageConfig.create({
        data: {
          userId: user.id,
          connectedAccountId: account.id,
          name,
          serverPath: dirPath,
          quotaBytes: parsedQuotaBytes,
          status: "active",
        },
      });
    }

    // Sync quota
    const quota = await LocalStorageService.syncLocalQuota(account.id);

    return NextResponse.json({
      account: {
        ...account,
        storageAccount: {
          id: quota.id,
          connected_account_id: quota.connectedAccountId,
          totalBytes: quota.totalBytes !== null ? quota.totalBytes.toString() : null,
          usedBytes: quota.usedBytes.toString(),
          availableBytes: quota.availableBytes !== null ? quota.availableBytes.toString() : null,
          trashBytes: quota.trashBytes !== null ? quota.trashBytes.toString() : null,
          lastSyncedAt: quota.lastSyncedAt ? quota.lastSyncedAt.toISOString() : null,
        },
      },
    }, { status: 201 });

  } catch (err: any) {
    console.error("Connect local storage error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
