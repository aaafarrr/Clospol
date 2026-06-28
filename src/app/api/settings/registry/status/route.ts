import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { readEnv } from "@/lib/env-writer";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = readEnv();
    const storageAccountId = env.REGISTRY_STORAGE_ACCOUNT_ID || "";
    const autoSync = env.REGISTRY_AUTO_SYNC === "true";
    
    let lastSyncedAt = env.REGISTRY_LAST_SYNCED_AT || null;
    try {
      const fs = require("fs");
      const path = require("path");
      const statusFile = path.resolve("storage/registry-status.json");
      if (fs.existsSync(statusFile)) {
        const statusData = JSON.parse(fs.readFileSync(statusFile, "utf8"));
        if (statusData.lastSyncedAt) {
          lastSyncedAt = statusData.lastSyncedAt;
        }
      }
    } catch (_) {}

    // Fetch active cloud storage drives (S3, Google Drive, OneDrive, and Dropbox)
    const drives = await prisma.connectedAccount.findMany({
      where: {
        userId: user.id,
        status: "connected",
        provider: { in: ["s3", "google_drive", "onedrive", "dropbox"] },
      },
    });

    return NextResponse.json({
      storageAccountId,
      autoSync,
      lastSyncedAt,
      drives,
    });
  } catch (err: any) {
    console.error("GET registry status error:", err);
    return NextResponse.json({ error: "Failed to load registry status." }, { status: 500 });
  }
}
