import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt, generateSecureToken } from "@/lib/crypto";
import { S3StorageService } from "@/services/storage/s3";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, bucket, region, endpoint, accessKeyId, secretAccessKey, forcePathStyle, quotaBytes, prefix } = body;

    if (!name || !bucket || !region || !accessKeyId || !secretAccessKey) {
      return NextResponse.json({ error: "Required fields are missing" }, { status: 400 });
    }

    const providerAccountId = `${bucket}:${endpoint || region}`;

    // Get active provider config if exists
    const providerConfig = await prisma.providerConfig.findFirst({
      where: { provider: "google_drive", status: "active" },
    });
    const providerConfigId = providerConfig ? providerConfig.id : null;

    const parsedQuotaBytes = quotaBytes ? BigInt(quotaBytes) : null;
    const isForcePathStyle = forcePathStyle ?? !!endpoint;

    // Temporary config object to test connection
    const tempConfig: any = {
      userId: user.id,
      name,
      bucket,
      region,
      endpoint: endpoint || null,
      accessKeyIdEncrypted: encrypt(accessKeyId),
      secretAccessKeyEncrypted: encrypt(secretAccessKey),
      forcePathStyle: isForcePathStyle,
      prefix: prefix || process.env.S3_PREFIX || "clospol",
      quotaBytes: parsedQuotaBytes,
      status: "active",
    };

    // Test S3 connection
    try {
      await S3StorageService.testS3Connection(tempConfig);
    } catch (testErr: any) {
      return NextResponse.json({ code: "S3_CONNECTION_FAILED", message: testErr.message }, { status: 400 });
    }

    // Check for existing account
    let account = await prisma.connectedAccount.findFirst({
      where: {
        userId: user.id,
        provider: "s3",
        providerAccountId,
      },
    });

    if (account) {
      // Update
      account = await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          displayName: name,
          email: `${bucket} (S3)`,
          status: "connected",
        },
      });

      await prisma.s3StorageConfig.updateMany({
        where: { connectedAccountId: account.id },
        data: {
          name,
          bucket,
          region,
          endpoint: endpoint || null,
          accessKeyIdEncrypted: encrypt(accessKeyId),
          secretAccessKeyEncrypted: encrypt(secretAccessKey),
          forcePathStyle: isForcePathStyle,
          prefix: prefix || process.env.S3_PREFIX || "clospol",
          quotaBytes: parsedQuotaBytes,
        },
      });
    } else {
      // Create
      account = await prisma.connectedAccount.create({
        data: {
          userId: user.id,
          providerConfigId,
          provider: "s3",
          providerAccountId,
          email: `${bucket} (S3)`,
          displayName: name,
          accessTokenEncrypted: encrypt("s3"),
          refreshTokenEncrypted: encrypt(generateSecureToken()),
          tokenExpiresAt: new Date(Date.now() + 100 * 365 * 24 * 60 * 65000), // 100 years
          scopes: JSON.stringify([]),
          status: "connected",
        },
      });

      await prisma.s3StorageConfig.create({
        data: {
          userId: user.id,
          connectedAccountId: account.id,
          name,
          bucket,
          region,
          endpoint: endpoint || null,
          accessKeyIdEncrypted: encrypt(accessKeyId),
          secretAccessKeyEncrypted: encrypt(secretAccessKey),
          forcePathStyle: isForcePathStyle,
          prefix: prefix || process.env.S3_PREFIX || "clospol",
          quotaBytes: parsedQuotaBytes,
          status: "active",
        },
      });
    }

    // Sync S3 Quota
    const quota = await S3StorageService.syncS3Quota(account.id);

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
    console.error("Connect S3 storage error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
