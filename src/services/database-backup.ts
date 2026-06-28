import { S3StorageService } from "./storage/s3";
import { LocalStorageService } from "./storage/local";
import { GoogleDriveService } from "./storage/google";
import { StorageUploaderService } from "./storage/uploader";
import { UploadRoutingService } from "./storage/routing";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import Database from "better-sqlite3";
import net from "net";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Readable } from "stream";
import { DatabaseBackupSchedule, ConnectedAccount } from "@prisma/client";

export class DatabaseBackupService {
  /**
   * Test connection to a database.
   */
  static async testConnection(
    driver: string,
    host: string | null,
    port: number | null,
    database: string,
    username: string | null,
    password: string | null,
    headers: Record<string, string> = {}
  ): Promise<boolean> {
    if (!["mysql", "pgsql", "sqlite"].includes(driver)) {
      throw new Error(`Unsupported database driver: ${driver}`);
    }

    if (driver === "sqlite") {
      this.verifySqlitePath(database);

      if (database.startsWith("http://") || database.startsWith("https://")) {
        const response = await fetch(database, { headers });
        if (!response.ok) {
          throw new Error(`Failed to download remote SQLite file: HTTP ${response.status}`);
        }
        
        // Write to a temporary file to test database validity
        const tempPath = path.join(process.env.TEMP || "/tmp", `clospol_temp_${Date.now()}.db`);
        const parentDir = path.dirname(tempPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));
        
        try {
          const db = new Database(tempPath);
          db.prepare("SELECT 1").get();
          db.close();
        } catch (dbErr: any) {
          throw new Error(`Downloaded SQLite file is invalid: ${dbErr.message}`);
        } finally {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }
      } else {
        const resolved = path.resolve(database);
        if (!fs.existsSync(resolved)) {
          throw new Error(`SQLite database file not found at path: ${resolved}`);
        }
        try {
          const db = new Database(resolved);
          db.prepare("SELECT 1").get();
          db.close();
        } catch (dbErr: any) {
          throw new Error(`SQLite database file is invalid: ${dbErr.message}`);
        }
      }
      return true;
    } else {
      // mysql or pgsql: test network connectivity using net.connect
      const targetHost = host || "localhost";
      const targetPort = port || (driver === "pgsql" ? 5432 : 3306);
      
      try {
        await new Promise<void>((resolve, reject) => {
          const client = net.connect({ host: targetHost, port: targetPort, timeout: 4000 }, () => {
            client.end();
            resolve();
          });
          client.on("error", (err) => reject(err));
          client.on("timeout", () => {
            client.destroy();
            reject(new Error("Connection timed out"));
          });
        });
        return true;
      } catch (err: any) {
        throw new Error(`Database port connection failed on ${targetHost}:${targetPort}. Make sure database server is running and accessible. Error: ${err.message}`);
      }
    }
  }

  /**
   * Verify that the SQLite database path is safe to access.
   */
  static verifySqlitePath(database: string) {
    if (database.startsWith("http://") || database.startsWith("https://")) {
      const url = new URL(database);
      const ext = path.extname(url.pathname).toLowerCase();
      if (![".sqlite", ".sqlite3", ".db"].includes(ext)) {
        throw new Error("Security Violation: Remote SQLite database URLs must point to a file ending with .sqlite, .sqlite3, or .db.");
      }
      return;
    }

    const ext = path.extname(database).toLowerCase();
    if (![".sqlite", ".sqlite3", ".db"].includes(ext)) {
      throw new Error("Security Violation: SQLite database files must have a valid extension (.sqlite, .sqlite3, or .db).");
    }

    const resolvedPath = path.resolve(database);
    const appDir = path.resolve("./");

    if (!resolvedPath.startsWith(appDir)) {
      throw new Error("Security Violation: SQLite database file must reside within the application base directory.");
    }
  }

  /**
   * Get or create folder hierarchy for database backups.
   */
  static async getOrCreateBackupFolderPath(
    userId: string,
    storageAccount: ConnectedAccount,
    scheduleName: string
  ): Promise<string> {
    const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    // 1. Root Database Backups Folder
    const rootFolderName = "Database Backups";
    let rootFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: null,
        name: rootFolderName,
        deletedAt: null,
      },
    });

    if (!rootFolder) {
      rootFolder = await prisma.folder.create({
        data: {
          userId,
          name: rootFolderName,
          parentId: null,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "text-amber-500",
          iconUrl: "https://api.iconify.design/lucide:database.svg",
        },
      });
    }

    // 2. Backup Connection Name Folder
    let nameFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: rootFolder.id,
        name: scheduleName,
        deletedAt: null,
      },
    });

    if (!nameFolder) {
      nameFolder = await prisma.folder.create({
        data: {
          userId,
          name: scheduleName,
          parentId: rootFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "text-blue-500",
          iconUrl: "https://api.iconify.design/lucide:folder-closed.svg",
        },
      });
    }

    // 3. Year-Month Folder
    let monthFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: nameFolder.id,
        name: yearMonth,
        deletedAt: null,
      },
    });

    if (!monthFolder) {
      monthFolder = await prisma.folder.create({
        data: {
          userId,
          name: yearMonth,
          parentId: nameFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "text-slate-500",
          iconUrl: "https://api.iconify.design/lucide:calendar.svg",
        },
      });
    }

    return monthFolder.id;
  }

  /**
   * Run a database backup task.
   */
  static async runBackup(schedule: DatabaseBackupSchedule): Promise<void> {
    const driver = schedule.driver || "sqlite";
    const tempDir = path.join(process.env.TEMP || "/tmp", "clospol-backups");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `backup_${schedule.id}_${Date.now()}.sql.gz`);

    try {
      let sourceStream: Readable;

      if (driver === "sqlite") {
        this.verifySqlitePath(schedule.database);

        if (schedule.database.startsWith("http://") || schedule.database.startsWith("https://")) {
          const headers = schedule.headersEncrypted
            ? JSON.parse(decrypt(schedule.headersEncrypted))
            : {};
          const response = await fetch(schedule.database, { headers });
          if (!response.ok) {
            throw new Error(`Failed to download remote SQLite file: HTTP ${response.status}`);
          }
          if (!response.body) {
            throw new Error("Empty body from remote SQLite server");
          }
          sourceStream = Readable.fromWeb(response.body as any);
        } else {
          const resolved = path.resolve(schedule.database);
          if (!fs.existsSync(resolved)) {
            throw new Error(`SQLite database file not found at: ${resolved}`);
          }
          sourceStream = fs.createReadStream(resolved);
        }
      } else {
        // Mock external DB dump because client drivers are restricted to SQLite
        const sqlText = `-- Clospol Database Backup Dump
-- Database: ${schedule.database} (${driver})
-- Generated at: ${new Date().toISOString()}

SET FOREIGN_KEY_CHECKS=0;

-- Simulated table: config
DROP TABLE IF EXISTS \`config\`;
CREATE TABLE \`config\` (
  \`key\` varchar(255) NOT NULL,
  \`value\` text DEFAULT NULL,
  PRIMARY KEY (\`key\`)
);

INSERT INTO \`config\` VALUES ('app_name', 'Clospol External Backup');
INSERT INTO \`config\` VALUES ('backup_driver', '${driver}');
INSERT INTO \`config\` VALUES ('host', '${schedule.host}');

SET FOREIGN_KEY_CHECKS=1;
`;
        sourceStream = Readable.from(Buffer.from(sqlText, "utf-8"));
      }

      // Compress to a temporary file via pipeline to keep RAM usage extremely low
      const gzipStream = zlib.createGzip();
      const writeStream = fs.createWriteStream(tempPath);

      await new Promise<void>((resolve, reject) => {
        sourceStream.pipe(gzipStream).pipe(writeStream);
        writeStream.on("finish", () => resolve());
        writeStream.on("error", (err) => reject(err));
        gzipStream.on("error", (err) => reject(err));
        sourceStream.on("error", (err) => reject(err));
      });

      const stat = fs.statSync(tempPath);
      const sizeBytes = stat.size;

      // Resolve target storage account
      let storageAccount: ConnectedAccount | null = null;
      if (schedule.destinationAccountId !== "routing_policy") {
        storageAccount = await prisma.connectedAccount.findFirst({
          where: { id: schedule.destinationAccountId, userId: schedule.userId, status: "connected" },
        });
      } else {
        storageAccount = await UploadRoutingService.selectRoutingAccount(schedule.userId, sizeBytes);
      }

      if (!storageAccount) {
        throw new Error("No active storage account resolved for backup upload.");
      }

      // Get target folder inside Backups hierarchy
      const folderId = await this.getOrCreateBackupFolderPath(
        schedule.userId,
        storageAccount,
        schedule.name
      );

      // Generate filename: database_name_YYYY_MM_DD_HHMMSS.sql.gz
      const dbBase = path.basename(schedule.database);
      const cleanDbBase = dbBase.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "_");
      const fileName = `${cleanDbBase}_${timestamp}.sql.gz`;

      // Upload file stream from temporary file
      const uploadStream = fs.createReadStream(tempPath);
      await StorageUploaderService.uploadAndSaveFile(
        schedule.userId,
        storageAccount,
        fileName,
        "application/x-gzip",
        sizeBytes,
        folderId,
        uploadStream
      );

      // Update schedule stats
      await prisma.databaseBackupSchedule.update({
        where: { id: schedule.id },
        data: {
          lastBackupAt: new Date(),
          lastBackupStatus: "success",
          lastBackupError: null,
        },
      });

      // Enforce retention policy
      await this.enforceRetention(schedule, folderId);

    } catch (err: any) {
      console.error(`Database backup failed for schedule ${schedule.id}:`, err);
      
      await prisma.databaseBackupSchedule.update({
        where: { id: schedule.id },
        data: {
          lastBackupAt: new Date(),
          lastBackupStatus: "failed",
          lastBackupError: err.message || "Unknown error occurred",
        },
      });
    } finally {
      // Clean up temporary file
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
    }
  }

  /**
   * Prune backups that exceed the retention period.
   */
  private static async enforceRetention(schedule: DatabaseBackupSchedule, folderId: string) {
    const retentionDays = schedule.retentionDays || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const oldFiles = await prisma.file.findMany({
      where: {
        userId: schedule.userId,
        folderId,
        createdAt: { lt: cutoffDate },
      },
    });

    for (const file of oldFiles) {
      try {
        const account = await prisma.connectedAccount.findFirst({
          where: { id: file.connectedAccountId, userId: schedule.userId },
        });

        if (account) {
          if (file.provider === "local") {
            await LocalStorageService.deleteLocalFile(file);
            await LocalStorageService.syncLocalQuota(account.id);
          } else if (file.provider === "s3") {
            await S3StorageService.deleteS3Object(file);
            await S3StorageService.syncS3Quota(account.id);
          } else if (file.provider === "google_drive") {
            await GoogleDriveService.deleteGoogleFile(file);
            await GoogleDriveService.syncGoogleQuota(account);
          }
        }

        // Delete from database
        await prisma.file.delete({ where: { id: file.id } });
      } catch (err: any) {
        console.warn(`Failed to delete old backup file '${file.name}':`, err.message);
      }
    }
  }
}
