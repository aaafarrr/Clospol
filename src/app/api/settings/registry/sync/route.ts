import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { writeEnv } from "@/lib/env-writer";
import { CloudRegistryService } from "@/services/registry/cloud-registry";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { storageAccountId, passphrase, autoSync } = body;
    const { readEnv } = await import("@/lib/env-writer");
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const env = readEnv();

    const activePassphrase = passphrase || (env.REGISTRY_PASSPHRASE_ENC ? decrypt(env.REGISTRY_PASSPHRASE_ENC) : "");

    if (!storageAccountId || !activePassphrase) {
      return NextResponse.json({ error: "Storage account and passphrase are required." }, { status: 400 });
    }

    // 1. Resolve the connected storage drive
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

    // 2. Export database registry configuration
    const exportedPayload = await CloudRegistryService.exportRegistry(user.id);

    // 3. Encrypt payload using user's passphrase
    const encryptedPayload = CloudRegistryService.encryptPayload(exportedPayload, activePassphrase);

    // 4. Upload to the cloud provider
    if (account.provider === "s3") {
      const s3Config = await prisma.s3StorageConfig.findFirst({
        where: { connectedAccountId: account.id, status: "active" },
      });
      if (!s3Config) {
        return NextResponse.json({ error: "S3 Storage configuration not found." }, { status: 404 });
      }
      await CloudRegistryService.uploadToS3(s3Config, encryptedPayload);
    } else if (account.provider === "google_drive") {
      await CloudRegistryService.uploadToGoogleDrive(account, encryptedPayload);
    } else if (account.provider === "dropbox") {
      await CloudRegistryService.uploadToDropbox(account, encryptedPayload);
    } else if (account.provider === "onedrive") {
      await CloudRegistryService.uploadToOneDrive(account, encryptedPayload);
    } else {
      return NextResponse.json({ error: "Unsupported cloud storage provider." }, { status: 400 });
    }

    // 5. Update environment variables
    const lastSyncedAt = new Date().toISOString();
    writeEnv({
      REGISTRY_STORAGE_ACCOUNT_ID: storageAccountId,
      REGISTRY_AUTO_SYNC: autoSync ? "true" : "false",
      REGISTRY_PASSPHRASE_ENC: encrypt(activePassphrase),
    });

    try {
      const fs = require("fs");
      const path = require("path");
      const statusFile = path.resolve("storage/registry-status.json");
      fs.mkdirSync(path.dirname(statusFile), { recursive: true });
      fs.writeFileSync(statusFile, JSON.stringify({ lastSyncedAt }), "utf8");
    } catch (_) {}

    // 6. Log audit activity
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "sync_registry",
        entityType: "system",
        metadata: JSON.stringify({
          provider: account.provider,
          email: account.email,
          timestamp: lastSyncedAt,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      lastSyncedAt,
      message: "Configuration successfully synchronized to cloud registry.",
    });
  } catch (err: any) {
    console.error("POST registry sync error:", err);
    return NextResponse.json({ error: err.message || "Failed to sync configuration to cloud." }, { status: 500 });
  }
}
