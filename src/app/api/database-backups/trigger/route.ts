import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { StorageUploaderService } from "@/services/storage/uploader";
import { UploadRoutingService } from "@/services/storage/routing";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    const dbPath = path.resolve("./dev.db");
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Database file dev.db not found" }, { status: 404 });
    }

    const fileStats = fs.statSync(dbPath);
    const size = fileStats.size;
    const dbStream = fs.createReadStream(dbPath);

    // Resolve target storage account for backup upload
    const storageAccount = await UploadRoutingService.selectRoutingAccount(user.id, size);
    if (!storageAccount) {
      return NextResponse.json({ error: "No active storage account resolved for backup upload" }, { status: 507 });
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
    const backupFileName = `clospol_db_backup_${timestamp}.db`;

    // Root folder for backups configuration
    let backupsFolder = await prisma.folder.findFirst({
      where: {
        userId: user.id,
        parentId: null,
        name: "Backups",
        deletedAt: null,
      },
    });

    if (!backupsFolder) {
      backupsFolder = await prisma.folder.create({
        data: {
          userId: user.id,
          name: "Backups",
          parentId: null,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#4f46e5",
          iconUrl: "https://api.iconify.design/lucide:database.svg",
        },
      });
    }

    await StorageUploaderService.uploadAndSaveFile(
      user.id,
      storageAccount,
      backupFileName,
      "application/x-sqlite3",
      size,
      backupsFolder.id,
      dbStream
    );

    // Update backup logs status
    await prisma.databaseBackupSchedule.updateMany({
      where: { userId: user.id },
      data: { lastBackupAt: new Date() },
    });

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Manual database backup trigger failed:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
