import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { writeEnv } from "@/lib/env-writer";
import { CloudRegistryService } from "@/services/registry/cloud-registry";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      passphrase,
      storageAccountId,
      
      // Raw S3 configuration for direct fresh-install recovery
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      endpoint,
      forcePathStyle,
      prefix,
    } = body;

    if (!passphrase) {
      return NextResponse.json({ error: "Sync Passphrase is required." }, { status: 400 });
    }

    let encryptedPayload = "";

    // 1. Resolve recovery source: either existing connected drive or direct S3 credentials
    if (storageAccountId) {
      const account = await prisma.connectedAccount.findFirst({
        where: {
          id: storageAccountId,
          userId: user.id,
          status: "connected",
        },
      });

      if (!account) {
        return NextResponse.json({ error: "Connected storage account not found or disconnected." }, { status: 404 });
      }

      if (account.provider === "s3") {
        const s3Config = await prisma.s3StorageConfig.findFirst({
          where: { connectedAccountId: account.id, status: "active" },
        });
        if (!s3Config) {
          return NextResponse.json({ error: "S3 Storage configuration not found." }, { status: 404 });
        }
        encryptedPayload = await CloudRegistryService.downloadFromS3(s3Config);
      } else if (account.provider === "google_drive") {
        encryptedPayload = await CloudRegistryService.downloadFromGoogleDrive(account);
      } else if (account.provider === "dropbox") {
        encryptedPayload = await CloudRegistryService.downloadFromDropbox(account);
      } else if (account.provider === "onedrive") {
        encryptedPayload = await CloudRegistryService.downloadFromOneDrive(account);
      } else {
        return NextResponse.json({ error: "Unsupported cloud storage provider." }, { status: 400 });
      }
    } else if (bucket && region && accessKeyId && secretAccessKey) {
      // Direct S3 fetch (helps users restore configuration on a fresh server before connecting S3 permanently)
      const mockS3Config = {
        bucket,
        region,
        accessKeyIdEncrypted: encrypt(accessKeyId),
        secretAccessKeyEncrypted: encrypt(secretAccessKey),
        endpoint: endpoint || null,
        forcePathStyle: forcePathStyle === true || forcePathStyle === 1 || forcePathStyle === "true" ? 1 : 0,
        prefix: prefix || "clospol",
      };
      encryptedPayload = await CloudRegistryService.downloadFromS3(mockS3Config);
    } else {
      return NextResponse.json({ error: "Either a storageAccountId or S3 credentials must be provided." }, { status: 400 });
    }

    // 2. Decrypt the downloaded registry payload
    let decryptedPayload = "";
    try {
      decryptedPayload = CloudRegistryService.decryptPayload(encryptedPayload, passphrase);
    } catch (err: any) {
      return NextResponse.json({ error: "Decryption failed. Please verify your Sync Passphrase." }, { status: 400 });
    }

    // 3. Perform database restoration (this deletes existing config tables and maps them to this user)
    await CloudRegistryService.importRegistry(user.id, decryptedPayload);

    // 4. Update status env variables
    const lastSyncedAt = new Date().toISOString();
    writeEnv({
      ...(storageAccountId && { REGISTRY_STORAGE_ACCOUNT_ID: storageAccountId }),
    });

    try {
      const fs = require("fs");
      const path = require("path");
      const statusFile = path.resolve("storage/registry-status.json");
      fs.mkdirSync(path.dirname(statusFile), { recursive: true });
      fs.writeFileSync(statusFile, JSON.stringify({ lastSyncedAt }), "utf8");
    } catch (_) {}

    // 5. Log audit trail
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "recover_registry",
        entityType: "system",
        metadata: JSON.stringify({
          source: storageAccountId ? "connected_drive" : "direct_s3",
          timestamp: lastSyncedAt,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Configuration registry successfully loaded and recovered from cloud storage.",
    });
  } catch (err: any) {
    console.error("POST registry recover error:", err);
    return NextResponse.json({ error: err.message || "Failed to recover configuration from cloud registry." }, { status: 500 });
  }
}
