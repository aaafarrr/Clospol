import prisma from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { ConnectedAccount, File } from "@prisma/client";
import { Readable } from "stream";

export class OneDriveService {
  /**
   * Helper to read stream into buffer.
   */
  private static async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: any[] = [];
    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * Get dynamic authorized access token, auto-refreshing if expired.
   */
  static async getAuthedToken(account: ConnectedAccount): Promise<string> {
    if (!account.accessTokenEncrypted || !account.refreshTokenEncrypted || !account.tokenExpiresAt) {
      throw new Error("OneDrive OAuth tokens are missing.");
    }

    const config = await prisma.providerConfig.findUnique({
      where: { id: account.providerConfigId || "" },
    });

    if (!config) {
      throw new Error(`Provider config not found for account: ${account.id}`);
    }

    const accessToken = decrypt(account.accessTokenEncrypted);
    const isExpired = account.tokenExpiresAt.getTime() < (Date.now() + 60000);

    if (!isExpired) {
      return accessToken;
    }

    const clientId = decrypt(config.clientIdEncrypted);
    const clientSecret = decrypt(config.clientSecretEncrypted);
    const refreshToken = decrypt(account.refreshTokenEncrypted);

    try {
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: config.redirectUri,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OneDrive refresh token HTTP error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error("Access token missing in OneDrive refresh response.");
      }

      const expiresAt = new Date(Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600 * 1000));

      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: encrypt(data.access_token),
          tokenExpiresAt: expiresAt,
        },
      });

      return data.access_token;
    } catch (err: any) {
      console.error(`Failed to refresh OneDrive token: ${err.message}`);
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastError: `OAuth Token Refresh Failed: ${err.message}` },
      });
      throw err;
    }
  }

  /**
   * Sync OneDrive storage quota info.
   */
  static async syncOneDriveQuota(account: ConnectedAccount) {
    const token = await this.getAuthedToken(account);
    const response = await fetch("https://graph.microsoft.com/v1.0/me/drive", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OneDrive space usage: ${response.statusText}`);
    }

    const data = await response.json();
    const total = data.quota && typeof data.quota.total === "number" ? data.quota.total : null;
    const used = data.quota && typeof data.quota.used === "number" ? data.quota.used : 0;
    const available = data.quota && typeof data.quota.remaining === "number" ? data.quota.remaining : null;

    return prisma.storageAccount.upsert({
      where: { connectedAccountId: account.id },
      create: {
        connectedAccountId: account.id,
        totalBytes: total,
        usedBytes: used,
        availableBytes: available,
        trashBytes: 0,
        lastSyncedAt: new Date(),
      },
      update: {
        totalBytes: total,
        usedBytes: used,
        availableBytes: available,
        trashBytes: 0,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Upload file to OneDrive in the `/clospol` root folder.
   */
  static async uploadOneDriveFile(account: ConnectedAccount, fileName: string, stream: Readable, mimeType: string): Promise<string> {
    const token = await this.getAuthedToken(account);
    const fileBuffer = await this.streamToBuffer(stream);

    const prefix = (process.env.ONEDRIVE_PREFIX || "clospol").replace(/^\/+/, "").replace(/\/+$/, "");
    const onedriveUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${prefix}/${encodeURIComponent(fileName)}:/content`;

    const response = await fetch(onedriveUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": mimeType || "application/octet-stream",
      },
      body: fileBuffer as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OneDrive upload failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!data.id) {
      throw new Error("OneDrive upload response does not contain item ID.");
    }

    return data.id;
  }

  /**
   * Delete file from OneDrive.
   */
  static async deleteOneDriveFile(file: File): Promise<void> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: file.connectedAccountId },
    });

    if (!account) {
      throw new Error(`Connected account not found for file: ${file.name}`);
    }

    const token = await this.getAuthedToken(account);
    const onedriveUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${file.providerFileId}`;

    const response = await fetch(onedriveUrl, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`OneDrive delete failed: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Stream download a OneDrive file.
   */
  static async streamOneDriveFile(file: File): Promise<Readable> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: file.connectedAccountId },
    });

    if (!account) {
      throw new Error(`Connected account not found for file: ${file.name}`);
    }

    const token = await this.getAuthedToken(account);
    const onedriveUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${file.providerFileId}/content`;

    const response = await fetch(onedriveUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OneDrive download failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("OneDrive response body is empty.");
    }

    return Readable.fromWeb(response.body as any);
  }

  /**
   * Sync OneDrive folder contents with DB.
   */
  static async syncOneDriveAppFolderFiles(accountId: string, userId: string) {
    const account = await prisma.connectedAccount.findFirst({
      where: {
        id: accountId,
        userId: userId,
        provider: "onedrive",
        status: "connected",
      },
    });

    if (!account) {
      throw new Error(`OneDrive ConnectedAccount not found or disconnected: ${accountId}`);
    }

    const token = await this.getAuthedToken(account);
    const driveFiles: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }> = [];

    const prefix = (process.env.ONEDRIVE_PREFIX || "clospol").replace(/^\/+/, "").replace(/\/+$/, "");
    try {
      let url = `https://graph.microsoft.com/v1.0/me/drive/root:/${prefix}:/children?$top=1000`;

      while (url) {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          break;
        }

        const data = await response.json();
        const items = data.value || [];

        for (const item of items) {
          if (item.file) {
            driveFiles.push({
              id: item.id,
              name: item.name,
              mimeType: item.file.mimeType || "application/octet-stream",
              sizeBytes: item.size || 0,
            });
          }
        }

        url = data["@odata.nextLink"] || "";
      }
    } catch (_) {
      // Ignore if folder doesn't exist
    }

    const existingFiles = await prisma.file.findMany({
      where: {
        userId,
        connectedAccountId: account.id,
        provider: "onedrive",
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
        await prisma.file.create({
          data: {
            userId,
            connectedAccountId: account.id,
            provider: "onedrive",
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
      await this.syncOneDriveQuota(account);
    } catch (_) {}

    return {
      accountId: account.id,
      created,
      updated,
      deleted,
    };
  }
}
