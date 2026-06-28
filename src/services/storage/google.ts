import { google } from "googleapis";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { ConnectedAccount, ProviderConfig, File } from "@prisma/client";

export class GoogleDriveService {
  static readonly GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";

  /**
   * Instantiate Google OAuth2 Client.
   */
  static async createOAuthClient(config: ProviderConfig) {
    const clientId = decrypt(config.clientIdEncrypted);
    const clientSecret = decrypt(config.clientSecretEncrypted);

    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      config.redirectUri
    );
  }

  /**
   * Get an authenticated Google API Client, auto-refreshing expired tokens.
   */
  static async getAuthedGoogleClient(account: ConnectedAccount) {
    if (!account.accessTokenEncrypted || !account.refreshTokenEncrypted || !account.tokenExpiresAt) {
      throw new Error("Google Drive OAuth tokens are missing.");
    }

    const config = await prisma.providerConfig.findUnique({
      where: { id: account.providerConfigId || "" },
    });

    if (!config) {
      throw new Error(`Provider config not found for account: ${account.id}`);
    }

    const oauth2Client = await this.createOAuthClient(config);
    const accessToken = decrypt(account.accessTokenEncrypted);
    const refreshToken = decrypt(account.refreshTokenEncrypted);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: account.tokenExpiresAt.getTime(),
    });

    // Refresh token if expired or expiring in less than 60 seconds
    const isExpired = account.tokenExpiresAt.getTime() < (Date.now() + 60000);
    if (isExpired) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        if (credentials.access_token) {
          const expiresAt = new Date(Date.now() + (credentials.expiry_date ? credentials.expiry_date - Date.now() : 3600000));
          await prisma.connectedAccount.update({
            where: { id: account.id },
            data: {
              accessTokenEncrypted: encrypt(credentials.access_token),
              tokenExpiresAt: expiresAt,
            },
          });
          oauth2Client.setCredentials(credentials);
        }
      } catch (err: any) {
        console.error(`Failed to refresh Google Drive token: ${err.message}`);
        await prisma.connectedAccount.update({
          where: { id: account.id },
          data: { lastError: `OAuth Token Refresh Failed: ${err.message}` },
        });
        throw err;
      }
    }

    return oauth2Client;
  }

  /**
   * Sync Google Drive storage quota info.
   */
  static async syncGoogleQuota(account: ConnectedAccount) {
    const auth = await this.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.about.get({
      fields: "storageQuota,user",
    });

    const quota = response.data.storageQuota;
    if (!quota) {
      throw new Error("Quota response from Google Drive is empty.");
    }

    const total = quota.limit ? Number(quota.limit) : null;
    const used = quota.usage ? Number(quota.usage) : 0;
    const trash = quota.usageInDriveTrash ? Number(quota.usageInDriveTrash) : 0;
    const available = total !== null ? total - used : null;

    return prisma.storageAccount.upsert({
      where: { connectedAccountId: account.id },
      create: {
        connectedAccountId: account.id,
        totalBytes: total,
        usedBytes: used,
        availableBytes: available,
        trashBytes: trash,
        lastSyncedAt: new Date(),
      },
      update: {
        totalBytes: total,
        usedBytes: used,
        availableBytes: available,
        trashBytes: trash,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Resolve root folder name from environment.
   */
  static getAppFolderName(): string {
    return process.env.GOOGLE_DRIVE_ROOT_FOLDER || "clospol";
  }

  /**
   * Ensure root app folder exists in Google Drive.
   */
  static async ensureGoogleAppFolder(account: ConnectedAccount): Promise<string> {
    const auth = await this.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    const folderName = this.getAppFolderName();
    const query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = '${this.GOOGLE_FOLDER_MIME}' and 'root' in parents and trashed = false`;

    const response = await drive.files.list({
      q: query,
      spaces: "drive",
      fields: "files(id,name)",
      pageSize: 1,
    });

    const files = response.data.files || [];
    if (files.length > 0 && files[0].id) {
      return files[0].id;
    }

    // Create the folder
    const folderMetadata = {
      name: folderName,
      mimeType: this.GOOGLE_FOLDER_MIME,
      parents: ["root"],
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: "id",
    });

    if (!folder.data.id) {
      throw new Error("Failed to create root app folder in Google Drive.");
    }

    return folder.data.id;
  }

  /**
   * Upload file to Google Drive under the app's root folder.
   */
  static async uploadGoogleFile(account: ConnectedAccount, fileName: string, stream: Readable, mimeType: string): Promise<string> {
    const auth = await this.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    const appFolderId = await this.ensureGoogleAppFolder(account);

    const fileMetadata = {
      name: fileName,
      parents: [appFolderId],
    };

    const media = {
      mimeType: mimeType,
      body: stream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id",
    });

    if (!response.data.id) {
      throw new Error("Failed to upload file to Google Drive.");
    }

    return response.data.id;
  }

  /**
   * Delete file from Google Drive.
   */
  static async deleteGoogleFile(file: File): Promise<void> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: file.connectedAccountId },
    });

    if (!account) {
      throw new Error(`Connected account not found for file: ${file.name}`);
    }

    const auth = await this.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    await drive.files.delete({
      fileId: file.providerFileId,
    });
  }

  /**
   * Stream download a Google Drive file.
   */
  static async streamGoogleFile(file: File): Promise<Readable> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: file.connectedAccountId },
    });

    if (!account) {
      throw new Error(`Connected account not found for file: ${file.name}`);
    }

    const auth = await this.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.get(
      { fileId: file.providerFileId, alt: "media" },
      { responseType: "stream" }
    );

    return response.data as Readable;
  }

  /**
   * Sync Google Drive app folder files with SQLite DB metadata.
   */
  static async syncGoogleAppFolderFiles(accountId: string, userId: string) {
    const account = await prisma.connectedAccount.findFirst({
      where: {
        id: accountId,
        userId: userId,
        provider: "google_drive",
        status: "connected",
      },
    });

    if (!account) {
      throw new Error(`Google Drive ConnectedAccount not found or disconnected: ${accountId}`);
    }

    const auth = await this.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });
    const appFolderId = await this.ensureGoogleAppFolder(account);

    const driveFiles: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }> = [];
    let pageToken: string | undefined = undefined;

    do {
      const response: any = await drive.files.list({
        q: `'${appFolderId}' in parents and mimeType != '${this.GOOGLE_FOLDER_MIME}' and trashed = false`,
        spaces: "drive",
        fields: "nextPageToken,files(id,name,mimeType,size)",
        pageSize: 1000,
        pageToken: pageToken,
      });

      const files = response.data.files || [];
      for (const file of files) {
        if (!file.id || !file.name || !file.mimeType) continue;
        driveFiles.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: Number(file.size || 0),
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    // Sync database
    const existingFiles = await prisma.file.findMany({
      where: {
        userId,
        connectedAccountId: account.id,
        provider: "google_drive",
      },
    });

    const existingByProviderId = new Map<string, any>(existingFiles.map((f: any) => [f.providerFileId, f]));
    const driveFileIds = new Set(driveFiles.map((f) => f.id));

    let created = 0;
    let updated = 0;
    let deleted = 0;

    for (const driveFile of driveFiles) {
      const existing = existingByProviderId.get(driveFile.id);
      if (!existing) {
        // Create new file metadata entry
        await prisma.file.create({
          data: {
            userId,
            connectedAccountId: account.id,
            provider: "google_drive",
            providerFileId: driveFile.id,
            name: driveFile.name,
            mimeType: driveFile.mimeType,
            sizeBytes: driveFile.sizeBytes,
            status: "active",
            isStarred: false,
          },
        });
        created++;
      } else {
        const needsUpdate =
          existing.name !== driveFile.name ||
          existing.mimeType !== driveFile.mimeType ||
          Number(existing.sizeBytes) !== driveFile.sizeBytes ||
          existing.status !== "active" ||
          existing.deletedAt !== null;

        if (needsUpdate) {
          await prisma.file.update({
            where: { id: existing.id },
            data: {
              name: driveFile.name,
              mimeType: driveFile.mimeType,
              sizeBytes: driveFile.sizeBytes,
              status: "active",
              deletedAt: null,
            },
          });
          updated++;
        }
      }
    }

    // Mark missing files as deleted
    const missingActiveIds = existingFiles
      .filter((f) => f.status === "active" && !driveFileIds.has(f.providerFileId))
      .map((f) => f.id);

    if (missingActiveIds.length > 0) {
      const deleteResult = await prisma.file.updateMany({
        where: { id: { in: missingActiveIds } },
        data: {
          status: "deleted",
          deletedAt: new Date(),
        },
      });
      deleted = deleteResult.count;
    }

    try {
      await this.syncGoogleQuota(account);
    } catch (err: any) {
      console.warn(`Failed to sync quota during folder sync: ${err.message}`);
    }

    return {
      accountId: account.id,
      created,
      updated,
      deleted,
    };
  }
}
