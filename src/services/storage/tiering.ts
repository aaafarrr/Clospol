import { Readable } from "stream";
import prisma from "@/lib/db";
import { ConnectedAccount, File, AutoTieringRule } from "@prisma/client";
import { LocalStorageService } from "./local";
import { S3StorageService } from "./s3";
import { GoogleDriveService } from "./google";
import { StorageUploaderService } from "./uploader";

export class AutoTieringService {
  /**
   * Run a single auto-tiering rule.
   */
  static async runRule(rule: AutoTieringRule): Promise<void> {
    console.log(`[Auto-Tiering] Executing rule: ${rule.name}`);
    
    let conditions: { daysOlderThan: number } = { daysOlderThan: 30 };
    try {
      conditions = JSON.parse(rule.ruleConditions);
    } catch (_) {}

    const cutoffDate = new Date(Date.now() - conditions.daysOlderThan * 24 * 60 * 60 * 1000);

    // 1. Fetch files in source account that are older than cutoffDate
    const filesToMigrate = await prisma.file.findMany({
      where: {
        userId: rule.userId,
        connectedAccountId: rule.sourceAccountId,
        createdAt: { lt: cutoffDate },
        status: "active",
        deletedAt: null,
      },
    });

    if (filesToMigrate.length === 0) {
      console.log(`[Auto-Tiering] No files to migrate for rule: ${rule.name}`);
      await prisma.autoTieringRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date() },
      });
      return;
    }

    const targetAccount = await prisma.connectedAccount.findUnique({
      where: { id: rule.targetAccountId },
    });

    if (!targetAccount) {
      throw new Error(`Target storage account not found: ${rule.targetAccountId}`);
    }

    console.log(`[Auto-Tiering] Found ${filesToMigrate.length} files to migrate to ${targetAccount.displayName || targetAccount.provider}`);

    for (const file of filesToMigrate) {
      try {
        console.log(`[Auto-Tiering] Migrating file: ${file.name} (${file.sizeBytes} bytes)`);

        // Get read stream from source
        let sourceStream: Readable;
        try {
          const { StorageCoordinator } = await import("./coordinator");
          sourceStream = await StorageCoordinator.streamFile(file);
        } catch (streamErr: any) {
          console.error(`[Auto-Tiering] Failed to stream file ${file.name}: ${streamErr.message}`);
          continue;
        }

        // Upload stream to destination
        // Note: we want to keep the same folder structure, so we pass file.folderId
        await StorageUploaderService.uploadAndSaveFile(
          rule.userId,
          targetAccount,
          file.name,
          file.mimeType,
          Number(file.sizeBytes),
          file.folderId,
          sourceStream
        );

        // Delete source file from physical storage
        try {
          const { StorageCoordinator } = await import("./coordinator");
          await StorageCoordinator.deleteFile(file);
        } catch (delErr: any) {
          console.warn(`[Auto-Tiering] Failed to physically delete source file: ${delErr.message}`);
        }

        // Delete source file metadata from DB
        await prisma.file.delete({ where: { id: file.id } });

        console.log(`[Auto-Tiering] Successfully migrated: ${file.name}`);
      } catch (err: any) {
        console.error(`[Auto-Tiering] Failed to migrate file ${file.name}: ${err.message}`);
      }
    }

    await prisma.autoTieringRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date() },
    });
  }

  /**
   * Run all active rules in the system.
   */
  static async runAllRules(): Promise<void> {
    const activeRules = await prisma.autoTieringRule.findMany({
      where: { status: "active" },
    });

    for (const rule of activeRules) {
      try {
        await this.runRule(rule);
      } catch (err: any) {
        console.error(`[Auto-Tiering] Rule ${rule.name} failed: ${err.message}`);
      }
    }
  }
}
