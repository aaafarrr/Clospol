import { Readable } from "stream";
import prisma from "@/lib/db";
import { ConnectedAccount, File } from "@prisma/client";
import { LocalStorageService } from "./local";
import { S3StorageService } from "./s3";
import { GoogleDriveService } from "./google";

export class StorageUploaderService {
  /**
   * Save a readable stream directly into the resolved storage account.
   * Handles creating file metadata, uploading, updating statuses, and quota synchronization.
   */
  static async uploadAndSaveFile(
    userId: string,
    storageAccount: ConnectedAccount,
    fileName: string,
    mimeType: string,
    sizeBytes: number,
    folderId: string | null,
    stream: Readable,
    apiKeyInfo?: { id: string; name: string }
  ): Promise<File> {
    // 1. Create a provisional record with "uploading" status
    const fileRecord = await prisma.file.create({
      data: {
        userId,
        connectedAccountId: storageAccount.id,
        folderId,
        provider: storageAccount.provider,
        providerFileId: "pending",
        name: fileName,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        status: "uploading",
        isStarred: false,
      },
    });

    try {
      let providerFileId = "";

      if (storageAccount.provider === "local") {
        const config = await LocalStorageService.getLocalConfigForAccount(storageAccount.id, userId);
        providerFileId = LocalStorageService.buildLocalFileId(config, userId, fileRecord.id, fileName);
        await LocalStorageService.uploadLocalFile(config, providerFileId, stream);
        
        // Sync local quota
        await LocalStorageService.syncLocalQuota(storageAccount.id);

      } else if (storageAccount.provider === "s3") {
        const config = await S3StorageService.getS3ConfigForAccount(storageAccount.id, userId);
        providerFileId = S3StorageService.buildS3ObjectKey(config, userId, fileRecord.id, fileName);
        await S3StorageService.uploadS3Object(config, providerFileId, stream, mimeType);
        
        // Sync S3 quota
        await S3StorageService.syncS3Quota(storageAccount.id);

      } else if (storageAccount.provider === "google_drive") {
        providerFileId = await GoogleDriveService.uploadGoogleFile(
          storageAccount,
          fileName,
          stream,
          mimeType
        );
        
        // Sync Google quota
        await GoogleDriveService.syncGoogleQuota(storageAccount);
      } else if (storageAccount.provider === "dropbox") {
        const { DropboxService } = await import("./dropbox");
        providerFileId = await DropboxService.uploadDropboxFile(
          storageAccount,
          fileName,
          stream,
          mimeType
        );
        
        // Sync Dropbox quota
        await DropboxService.syncDropboxQuota(storageAccount);
      } else if (storageAccount.provider === "onedrive") {
        const { OneDriveService } = await import("./onedrive");
        providerFileId = await OneDriveService.uploadOneDriveFile(
          storageAccount,
          fileName,
          stream,
          mimeType
        );
        
        // Sync OneDrive quota
        await OneDriveService.syncOneDriveQuota(storageAccount);
      } else {
        throw new Error(`Unsupported storage provider: ${storageAccount.provider}`);
      }

      // 2. Update status to active and store provider file ID
      const activeFile = await prisma.file.update({
        where: { id: fileRecord.id },
        data: {
          providerFileId,
          status: "active",
        },
      });

      // 3. Log activity
      await prisma.auditLog.create({
        data: {
          userId,
          action: "upload",
          entityType: "file",
          entityId: activeFile.id,
          metadata: JSON.stringify({
            name: activeFile.name,
            sizeBytes: sizeBytes.toString(),
            source: apiKeyInfo ? "api" : "gateway",
            apiKeyId: apiKeyInfo?.id,
            apiKeyName: apiKeyInfo?.name,
          }),
        },
      });

      return activeFile;

    } catch (err: any) {
      console.error(`Storage uploader error for file ${fileName}: ${err.message}`);
      
      // Update status to failed
      await prisma.file.update({
        where: { id: fileRecord.id },
        data: { status: "failed" },
      });
      
      throw err;
    }
  }
}
