import prisma from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { ConnectedAccount, File } from "@prisma/client";
import { Readable } from "stream";

export class DropboxService {
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
      throw new Error("Dropbox OAuth tokens are missing.");
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
      const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dropbox refresh token HTTP error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error("Access token missing in Dropbox refresh response.");
      }

      const expiresAt = new Date(Date.now() + (data.expires_in ? data.expires_in * 1000 : 14400 * 1000));

      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: encrypt(data.access_token),
          tokenExpiresAt: expiresAt,
        },
      });

      return data.access_token;
    } catch (err: any) {
      console.error(`Failed to refresh Dropbox token: ${err.message}`);
      await prisma.connectedAccount.update({
        where: { id: account.id },
        data: { lastError: `OAuth Token Refresh Failed: ${err.message}` },
      });
      throw err;
    }
  }

  /**
   * Sync Dropbox storage quota info.
   */
  static async syncDropboxQuota(account: ConnectedAccount) {
    const token = await this.getAuthedToken(account);
    const response = await fetch("https://api.dropboxapi.com/2/users/get_space_usage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(null),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Dropbox space usage: ${response.statusText}`);
    }

    const data = await response.json();
    const total = data.allocation && typeof data.allocation.allocated === "number" ? data.allocation.allocated : null;
    const used = typeof data.used === "number" ? data.used : 0;
    const available = total !== null ? total - used : null;

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
   * Upload file to Dropbox in the `/clospol` root folder.
   */
  static async uploadDropboxFile(account: ConnectedAccount, fileName: string, stream: Readable, mimeType: string): Promise<string> {
    const token = await this.getAuthedToken(account);
    const fileBuffer = await this.streamToBuffer(stream);

    const prefix = (process.env.DROPBOX_PREFIX || "clospol").replace(/^\/+/, "").replace(/\/+$/, "");
    const dropboxPath = `/${prefix}/${fileName}`;
    const apiArg = JSON.stringify({
      path: dropboxPath,
      mode: "overwrite",
      autorename: false,
      mute: false,
      strict_conflict: false,
    });

    const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Dropbox-API-Arg": apiArg,
        "Content-Type": "application/octet-stream",
      },
      body: fileBuffer as any,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dropbox upload failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (!data.id) {
      throw new Error("Dropbox upload response does not contain file ID.");
    }

    return data.id;
  }

  /**
   * Delete file from Dropbox.
   */
  static async deleteDropboxFile(file: File): Promise<void> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: file.connectedAccountId },
    });

    if (!account) {
      throw new Error(`Connected account not found for file: ${file.name}`);
    }

    const token = await this.getAuthedToken(account);
    const response = await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: file.providerFileId,
      }),
    });

    if (!response.ok && response.status !== 409) {
      const errorText = await response.text();
      throw new Error(`Dropbox delete failed: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Stream download a Dropbox file.
   */
  static async streamDropboxFile(file: File): Promise<Readable> {
    const account = await prisma.connectedAccount.findUnique({
      where: { id: file.connectedAccountId },
    });

    if (!account) {
      throw new Error(`Connected account not found for file: ${file.name}`);
    }

    const token = await this.getAuthedToken(account);
    const response = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: file.providerFileId,
        }),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dropbox download failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("Dropbox response body is empty.");
    }

    return Readable.fromWeb(response.body as any);
  }

  /**
   * Sync Dropbox folder contents with DB.
   */
  static async syncDropboxAppFolderFiles(accountId: string, userId: string) {
    const account = await prisma.connectedAccount.findFirst({
      where: {
        id: accountId,
        userId: userId,
        provider: "dropbox",
        status: "connected",
      },
    });

    if (!account) {
      throw new Error(`Dropbox ConnectedAccount not found or disconnected: ${accountId}`);
    }

    const token = await this.getAuthedToken(account);
    const driveFiles: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }> = [];

    const prefix = (process.env.DROPBOX_PREFIX || "clospol").replace(/^\/+/, "").replace(/\/+$/, "");
    try {
      const response = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: `/${prefix}`,
          recursive: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || [];

        const processEntries = (itemEntries: any[]) => {
          for (const item of itemEntries) {
            if (item[".tag"] === "file") {
              driveFiles.push({
                id: item.id,
                name: item.name,
                mimeType: "application/octet-stream",
                sizeBytes: item.size || 0,
              });
            }
          }
        };

        processEntries(entries);

        let hasMore = data.has_more;
        let cursor = data.cursor;

        while (hasMore) {
          const nextRes = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ cursor }),
          });

          if (!nextRes.ok) break;
          const nextData = await nextRes.json();
          processEntries(nextData.entries || []);
          hasMore = nextData.has_more;
          cursor = nextData.cursor;
        }
      }
    } catch (_) {
      // Ignore if folder doesn't exist
    }

    const existingFiles = await prisma.file.findMany({
      where: {
        userId,
        connectedAccountId: account.id,
        provider: "dropbox",
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
            provider: "dropbox",
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
          Number(existing.sizeBytes) !== driveFile.sizeBytes ||
          existing.status !== "active" ||
          existing.deletedAt !== null;

        if (needsUpdate) {
          await prisma.file.update({
            where: { id: existing.id },
            data: {
              name: driveFile.name,
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
      await this.syncDropboxQuota(account);
    } catch (_) {}

    return {
      accountId: account.id,
      created,
      updated,
      deleted,
    };
  }
}
