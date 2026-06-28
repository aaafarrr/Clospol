import { Readable } from "stream";
import prisma from "@/lib/db";
import { File } from "@prisma/client";
import { LocalStorageService } from "./local";
import { S3StorageService } from "./s3";
import { GoogleDriveService } from "./google";
import { DropboxService } from "./dropbox";
import { OneDriveService } from "./onedrive";

export class StorageCoordinator {
  /**
   * Get download stream for a file from its provider.
   */
  static async streamFile(file: File): Promise<Readable> {
    if (file.provider === "local") {
      return LocalStorageService.streamLocalFile(file);
    } else if (file.provider === "s3") {
      return S3StorageService.streamS3File(file);
    } else if (file.provider === "google_drive") {
      return GoogleDriveService.streamGoogleFile(file);
    } else if (file.provider === "dropbox") {
      return DropboxService.streamDropboxFile(file);
    } else if (file.provider === "onedrive") {
      return OneDriveService.streamOneDriveFile(file);
    }
    throw new Error(`Unsupported download provider: ${file.provider}`);
  }

  /**
   * Physically delete a file from its provider storage.
   */
  static async deleteFile(file: File): Promise<void> {
    if (file.provider === "local") {
      await LocalStorageService.deleteLocalFile(file);
    } else if (file.provider === "s3") {
      await S3StorageService.deleteS3Object(file);
    } else if (file.provider === "google_drive") {
      await GoogleDriveService.deleteGoogleFile(file);
    } else if (file.provider === "dropbox") {
      await DropboxService.deleteDropboxFile(file);
    } else if (file.provider === "onedrive") {
      await OneDriveService.deleteOneDriveFile(file);
    } else {
      throw new Error(`Unsupported delete provider: ${file.provider}`);
    }
  }

  /**
   * Sync directory metadata for app-folder/quota with DB.
   */
  static async syncAccountFiles(accountId: string, userId: string, provider: string) {
    if (provider === "google_drive") {
      return GoogleDriveService.syncGoogleAppFolderFiles(accountId, userId);
    } else if (provider === "dropbox") {
      return DropboxService.syncDropboxAppFolderFiles(accountId, userId);
    } else if (provider === "onedrive") {
      return OneDriveService.syncOneDriveAppFolderFiles(accountId, userId);
    }
    return { accountId, created: 0, updated: 0, deleted: 0 };
  }
}
