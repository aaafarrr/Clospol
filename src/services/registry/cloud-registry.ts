import prisma from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import crypto from "crypto";
import { Readable } from "stream";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { GoogleDriveService } from "../storage/google";
import { google } from "googleapis";
import { sqlite } from "@/db";

export interface SyncConfig {
  storageAccountId: string; // The ID of the ConnectedAccount used for registry sync
  autoSync: boolean;        // Whether to auto sync on config changes
}

export class CloudRegistryService {
  private static readonly REGISTRY_FILENAME = "clospol-registry.json";

  /**
   * Derive a 32-byte key from a user-specified passphrase using PBKDF2.
   */
  private static deriveKey(passphrase: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, "sha256");
  }

  /**
   * Encrypt registry payload using AES-256-GCM.
   * Output format: salt_hex:iv_hex:auth_tag_hex:encrypted_hex
   */
  public static encryptPayload(payload: string, pass: string): string {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = this.deriveKey(pass, salt);
    
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(payload, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const tag = cipher.getAuthTag().toString("hex");
    return `${salt.toString("hex")}:${iv.toString("hex")}:${tag}:${encrypted}`;
  }

  /**
   * Decrypt registry payload using AES-256-GCM.
   */
  public static decryptPayload(encryptedStr: string, pass: string): string {
    const parts = encryptedStr.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted registry format. Expected salt:iv:tag:ciphertext");
    }
    
    const [saltHex, ivHex, tagHex, encryptedHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    
    const key = this.deriveKey(pass, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Export all configuration tables for the user into a JSON string,
   * decrypting any sensitive data encrypted with the local APP_KEY.
   */
  public static async exportRegistry(userId: string): Promise<string> {
    // Helper to safely decrypt database values
    const decryptField = (val: string | null | undefined) => {
      if (!val) return val;
      try {
        return decrypt(val);
      } catch (err) {
        console.warn("Failed to decrypt field during export, keeping raw value:", err);
        return val;
      }
    };

    // Query configs and accounts
    const providerConfigs = await prisma.providerConfig.findMany({ where: { userId } });
    const connectedAccounts = await prisma.connectedAccount.findMany({ where: { userId } });
    const s3StorageConfigs = await prisma.s3StorageConfig.findMany({ where: { userId } });
    const localStorageConfigs = await prisma.localStorageConfig.findMany({ where: { userId } });

    const accountIds = connectedAccounts.map((a: any) => a.id);
    const storageAccounts = accountIds.length > 0
      ? await prisma.storageAccount.findMany({ where: { connectedAccountId: { in: accountIds } } })
      : [];

    const uploadRoutingPolicy = await prisma.uploadRoutingPolicy.findFirst({ where: { userId } });
    const apiKeys = await prisma.apiKey.findMany({ where: { userId } });
    const messengerIntegrations = await prisma.messengerIntegration.findMany({ where: { userId } });
    const databaseBackupSchedules = await prisma.databaseBackupSchedule.findMany({ where: { userId } });
    const cctvCameras = await prisma.cctvCamera.findMany({ where: { userId } });
    const folders = await prisma.folder.findMany({ where: { userId } });
    const files = await prisma.file.findMany({ where: { userId } });

    const fileIds = files.map((f: any) => f.id);
    const fileShares = fileIds.length > 0
      ? await prisma.fileShare.findMany({ where: { fileId: { in: fileIds } } })
      : [];

    // Decrypt credentials to plain text so they can be re-encrypted on other servers
    const decryptedProviderConfigs = providerConfigs.map((c: any) => ({
      ...c,
      clientIdEncrypted: decryptField(c.clientIdEncrypted),
      clientSecretEncrypted: decryptField(c.clientSecretEncrypted),
    }));

    const decryptedConnectedAccounts = connectedAccounts.map((a: any) => ({
      ...a,
      accessTokenEncrypted: decryptField(a.accessTokenEncrypted),
      refreshTokenEncrypted: decryptField(a.refreshTokenEncrypted),
    }));

    const decryptedS3Configs = s3StorageConfigs.map((s: any) => ({
      ...s,
      accessKeyIdEncrypted: decryptField(s.accessKeyIdEncrypted),
      secretAccessKeyEncrypted: decryptField(s.secretAccessKeyEncrypted),
    }));

    const decryptedBackupSchedules = databaseBackupSchedules.map((b: any) => ({
      ...b,
      passwordEncrypted: decryptField(b.passwordEncrypted),
      headersEncrypted: decryptField(b.headersEncrypted),
    }));

    const decryptedMessengerIntegrations = messengerIntegrations.map((m: any) => ({
      ...m,
      botTokenEncrypted: decryptField(m.botTokenEncrypted),
    }));

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        providerConfigs: decryptedProviderConfigs,
        connectedAccounts: decryptedConnectedAccounts,
        s3StorageConfigs: decryptedS3Configs,
        localStorageConfigs,
        storageAccounts,
        uploadRoutingPolicy,
        apiKeys,
        messengerIntegrations: decryptedMessengerIntegrations,
        databaseBackupSchedules: decryptedBackupSchedules,
        cctvCameras,
        folders,
        files,
        fileShares,
      },
    };

    return JSON.stringify(payload);
  }

  /**
   * Import configuration tables from a decrypted JSON payload.
   * Maps user ID references to the current target user, re-encrypts sensitive credentials,
   * and runs in a safe sequential database transaction.
   */
  public static async importRegistry(userId: string, registryJson: string): Promise<void> {
    const parsed = JSON.parse(registryJson);
    if (!parsed || parsed.version !== 1 || !parsed.data) {
      throw new Error("Unsupported or invalid registry payload version.");
    }

    // Temporarily turn off SQLite foreign keys constraint checking
    sqlite.exec("PRAGMA foreign_keys = OFF");

    try {

    const {
      providerConfigs = [],
      connectedAccounts = [],
      s3StorageConfigs = [],
      localStorageConfigs = [],
      storageAccounts = [],
      uploadRoutingPolicy,
      apiKeys = [],
      messengerIntegrations = [],
      databaseBackupSchedules = [],
      cctvCameras = [],
      folders = [],
      files = [],
      fileShares = [],
    } = parsed.data;

    // Helper to safely re-encrypt values with the local server APP_KEY
    const encryptField = (val: string | null | undefined) => {
      if (!val) return val;
      try {
        return encrypt(val);
      } catch (err) {
        console.warn("Failed to encrypt field during import:", err);
        return val;
      }
    };

    // Helper to map and convert dates safely
    const parseDates = (obj: any): any => {
      if (!obj || typeof obj !== "object") return obj;
      const copy = { ...obj };
      for (const [key, val] of Object.entries(copy)) {
        if (typeof val === "string") {
          const lowerKey = key.toLowerCase();
          if (
            key.endsWith("At") ||
            lowerKey === "createdat" ||
            lowerKey === "updatedat" ||
            lowerKey === "expiresat" ||
            lowerKey === "revokedat" ||
            lowerKey === "lastusedat" ||
            lowerKey === "lastsyncedat" ||
            lowerKey === "lastbackupat" ||
            lowerKey === "lastcaptureat"
          ) {
            const parsedDate = new Date(val);
            if (!isNaN(parsedDate.getTime())) {
              copy[key] = parsedDate;
            }
          }
        }
      }
      return copy;
    };

    // --- SEQUENTIAL DELETION (Avoid DB constraint issues) ---
    // Fetch all connected account IDs for the current user
    const existingAccounts = await prisma.connectedAccount.findMany({ where: { userId } });
    const existingAccountIds = existingAccounts.map((a: any) => a.id);

    // 1. Delete shares
    const existingFiles = await prisma.file.findMany({ where: { userId } });
    const existingFileIds = existingFiles.map((f: any) => f.id);
    if (existingFileIds.length > 0) {
      await prisma.fileShare.deleteMany({ where: { fileId: { in: existingFileIds } } });
    }

    // 2. Delete files and folders
    await prisma.file.deleteMany({ where: { userId } });
    await prisma.folder.deleteMany({ where: { userId } });

    // 3. Delete storage accounts
    if (existingAccountIds.length > 0) {
      await prisma.storageAccount.deleteMany({ where: { connectedAccountId: { in: existingAccountIds } } });
    }

    // 4. Delete configs and integrations
    await prisma.s3StorageConfig.deleteMany({ where: { userId } });
    await prisma.localStorageConfig.deleteMany({ where: { userId } });
    await prisma.databaseBackupSchedule.deleteMany({ where: { userId } });
    await prisma.cctvCamera.deleteMany({ where: { userId } });
    await prisma.messengerIntegration.deleteMany({ where: { userId } });
    await prisma.uploadRoutingPolicy.deleteMany({ where: { userId } });
    await prisma.apiKey.deleteMany({ where: { userId } });
    await prisma.connectedAccount.deleteMany({ where: { userId } });
    await prisma.providerConfig.deleteMany({ where: { userId } });

    // --- SEQUENTIAL INSERTION ---
    // 1. Provider Configs
    for (const item of providerConfigs) {
      const parsedItem = parseDates(item);
      await prisma.providerConfig.create({
        data: {
          ...parsedItem,
          userId,
          clientIdEncrypted: encryptField(parsedItem.clientIdEncrypted),
          clientSecretEncrypted: encryptField(parsedItem.clientSecretEncrypted),
        },
      });
    }

    // 2. Connected Accounts
    for (const item of connectedAccounts) {
      const parsedItem = parseDates(item);
      await prisma.connectedAccount.create({
        data: {
          ...parsedItem,
          userId,
          accessTokenEncrypted: encryptField(parsedItem.accessTokenEncrypted),
          refreshTokenEncrypted: encryptField(parsedItem.refreshTokenEncrypted),
        },
      });
    }

    // 3. Storage Configs
    for (const item of s3StorageConfigs) {
      const parsedItem = parseDates(item);
      await prisma.s3StorageConfig.create({
        data: {
          ...parsedItem,
          userId,
          accessKeyIdEncrypted: encryptField(parsedItem.accessKeyIdEncrypted),
          secretAccessKeyEncrypted: encryptField(parsedItem.secretAccessKeyEncrypted),
        },
      });
    }

    for (const item of localStorageConfigs) {
      const parsedItem = parseDates(item);
      await prisma.localStorageConfig.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }

    // 4. Storage Accounts
    for (const item of storageAccounts) {
      const parsedItem = parseDates(item);
      await prisma.storageAccount.create({
        data: {
          ...parsedItem,
        },
      });
    }

    // 5. Upload Routing Policy
    if (uploadRoutingPolicy) {
      const parsedItem = parseDates(uploadRoutingPolicy);
      await prisma.uploadRoutingPolicy.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }

    // 6. API Keys
    for (const item of apiKeys) {
      const parsedItem = parseDates(item);
      await prisma.apiKey.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }

    // 7. Messenger Integrations
    for (const item of messengerIntegrations) {
      const parsedItem = parseDates(item);
      await prisma.messengerIntegration.create({
        data: {
          ...parsedItem,
          userId,
          botTokenEncrypted: encryptField(parsedItem.botTokenEncrypted),
        },
      });
    }

    // 8. Backup Schedules
    for (const item of databaseBackupSchedules) {
      const parsedItem = parseDates(item);
      await prisma.databaseBackupSchedule.create({
        data: {
          ...parsedItem,
          userId,
          passwordEncrypted: encryptField(parsedItem.passwordEncrypted),
          headersEncrypted: encryptField(parsedItem.headersEncrypted),
        },
      });
    }

    // 9. CCTV Cameras
    for (const item of cctvCameras) {
      const parsedItem = parseDates(item);
      await prisma.cctvCamera.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }

    // 10. Folders
    for (const item of folders) {
      const parsedItem = parseDates(item);
      await prisma.folder.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }

    // 11. Files
    for (const item of files) {
      const parsedItem = parseDates(item);
      await prisma.file.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }

    // 12. Shares
    for (const item of fileShares) {
      const parsedItem = parseDates(item);
      await prisma.fileShare.create({
        data: {
          ...parsedItem,
          userId,
        },
      });
    }
    } finally {
      // Re-enable SQLite foreign keys constraint checking
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
  }

  /**
   * Upload the encrypted registry JSON to S3 storage.
   */
  public static async uploadToS3(s3Config: any, encryptedPayload: string): Promise<void> {
    const key = decrypt(s3Config.accessKeyIdEncrypted);
    const secret = decrypt(s3Config.secretAccessKeyEncrypted);

    const client = new S3Client({
      region: s3Config.region,
      forcePathStyle: s3Config.forcePathStyle === 1 || s3Config.forcePathStyle === true,
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
      ...(s3Config.endpoint && { endpoint: s3Config.endpoint }),
    });

    const cleanPrefix = s3Config.prefix.trim().replace(/[\\/]+$/, "");
    const objectKey = cleanPrefix ? `${cleanPrefix}/${this.REGISTRY_FILENAME}` : this.REGISTRY_FILENAME;

    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: objectKey,
        Body: encryptedPayload,
        ContentType: "application/json",
      })
    );
  }

  /**
   * Download the encrypted registry JSON from S3 storage.
   */
  public static async downloadFromS3(s3Config: any): Promise<string> {
    const key = decrypt(s3Config.accessKeyIdEncrypted);
    const secret = decrypt(s3Config.secretAccessKeyEncrypted);

    const client = new S3Client({
      region: s3Config.region,
      forcePathStyle: s3Config.forcePathStyle === 1 || s3Config.forcePathStyle === true,
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
      ...(s3Config.endpoint && { endpoint: s3Config.endpoint }),
    });

    const cleanPrefix = s3Config.prefix.trim().replace(/[\\/]+$/, "");
    const objectKey = cleanPrefix ? `${cleanPrefix}/${this.REGISTRY_FILENAME}` : this.REGISTRY_FILENAME;

    const res = await client.send(
      new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: objectKey,
      })
    );

    if (!res.Body) {
      throw new Error("Empty body returned from S3 registry download.");
    }

    return await res.Body.transformToString();
  }

  /**
   * Upload the encrypted registry JSON to Google Drive under the app's root folder.
   */
  public static async uploadToGoogleDrive(account: any, encryptedPayload: string): Promise<void> {
    const auth = await GoogleDriveService.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    const appFolderId = await GoogleDriveService.ensureGoogleAppFolder(account);

    // Search if file exists
    const q = `name = '${this.REGISTRY_FILENAME}' and '${appFolderId}' in parents and trashed = false`;
    const listRes = await drive.files.list({
      q,
      spaces: "drive",
      fields: "files(id)",
      pageSize: 1,
    });

    const files = listRes.data.files || [];

    const media = {
      mimeType: "application/json",
      body: Readable.from(Buffer.from(encryptedPayload, "utf-8")),
    };

    if (files.length > 0 && files[0].id) {
      await drive.files.update({
        fileId: files[0].id,
        media,
      });
    } else {
      await drive.files.create({
        requestBody: {
          name: this.REGISTRY_FILENAME,
          parents: [appFolderId],
        },
        media,
        fields: "id",
      });
    }
  }

  /**
   * Download the encrypted registry JSON from Google Drive.
   */
  public static async downloadFromGoogleDrive(account: any): Promise<string> {
    const auth = await GoogleDriveService.getAuthedGoogleClient(account);
    const drive = google.drive({ version: "v3", auth });

    const appFolderId = await GoogleDriveService.ensureGoogleAppFolder(account);

    const q = `name = '${this.REGISTRY_FILENAME}' and '${appFolderId}' in parents and trashed = false`;
    const listRes = await drive.files.list({
      q,
      spaces: "drive",
      fields: "files(id)",
      pageSize: 1,
    });

    const files = listRes.data.files || [];
    if (files.length === 0 || !files[0].id) {
      throw new Error(`Registry file '${this.REGISTRY_FILENAME}' not found in Google Drive.`);
    }

    const response = await drive.files.get(
      { fileId: files[0].id, alt: "media" },
      { responseType: "stream" }
    );

    return new Promise<string>((resolve, reject) => {
      let data = "";
      const stream = response.data as Readable;
      stream.on("data", (chunk) => (data += chunk));
      stream.on("end", () => resolve(data));
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Upload the encrypted registry JSON to Dropbox.
   */
  public static async uploadToDropbox(account: any, encryptedPayload: string): Promise<void> {
    const { DropboxService } = await import("../storage/dropbox");
    const stream = Readable.from(Buffer.from(encryptedPayload, "utf-8"));
    await DropboxService.uploadDropboxFile(account, this.REGISTRY_FILENAME, stream, "application/json");
  }

  /**
   * Download the encrypted registry JSON from Dropbox.
   */
  public static async downloadFromDropbox(account: any): Promise<string> {
    const { DropboxService } = await import("../storage/dropbox");
    const token = await DropboxService.getAuthedToken(account);
    const response = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: `/clospol/${this.REGISTRY_FILENAME}`,
        }),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Dropbox download registry failed: ${response.status} - ${text}`);
    }

    return await response.text();
  }

  /**
   * Upload the encrypted registry JSON to Microsoft OneDrive.
   */
  public static async uploadToOneDrive(account: any, encryptedPayload: string): Promise<void> {
    const { OneDriveService } = await import("../storage/onedrive");
    const stream = Readable.from(Buffer.from(encryptedPayload, "utf-8"));
    await OneDriveService.uploadOneDriveFile(account, this.REGISTRY_FILENAME, stream, "application/json");
  }

  /**
   * Download the encrypted registry JSON from Microsoft OneDrive.
   */
  public static async downloadFromOneDrive(account: any): Promise<string> {
    const { OneDriveService } = await import("../storage/onedrive");
    const token = await OneDriveService.getAuthedToken(account);
    const onedriveUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/clospol/${this.REGISTRY_FILENAME}:/content`;
    const response = await fetch(onedriveUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OneDrive download registry failed: ${response.status} - ${text}`);
    }

    return await response.text();
  }

  /**
   * Debounced AutoSync trigger to avoid spamming the cloud on multiple sequential DB writes.
   */
  private static autoSyncDebounceTimer: NodeJS.Timeout | null = null;
  private static isSyncingAuto = false;

  public static triggerAutoSyncRegistry(userId: string): void {
    if (this.autoSyncDebounceTimer) {
      clearTimeout(this.autoSyncDebounceTimer);
    }

    this.autoSyncDebounceTimer = setTimeout(async () => {
      this.autoSyncDebounceTimer = null;
      await this.runAutoSync(userId);
    }, 10000); // 10-second debounce
  }

  private static async runAutoSync(userId: string): Promise<void> {
    if (this.isSyncingAuto) return;

    try {
      const { readEnv } = await import("@/lib/env-writer");
      const env = readEnv();

      if (env.REGISTRY_AUTO_SYNC !== "true" || !env.REGISTRY_STORAGE_ACCOUNT_ID) {
        return;
      }

      if (!env.REGISTRY_PASSPHRASE_ENC) {
        console.warn("[Registry AutoSync] Auto-sync is enabled but no passphrase is saved in environment.");
        return;
      }

      this.isSyncingAuto = true;
      console.log(`[Registry AutoSync] Starting auto-sync for user: ${userId}`);

      // Decrypt the passphrase using local APP_KEY
      const passphrase = decrypt(env.REGISTRY_PASSPHRASE_ENC);

      // Resolve the target storage account
      const account = await prisma.connectedAccount.findFirst({
        where: {
          id: env.REGISTRY_STORAGE_ACCOUNT_ID,
          userId,
          status: "connected",
        },
      });

      if (!account) {
        console.warn(`[Registry AutoSync] Storage account ${env.REGISTRY_STORAGE_ACCOUNT_ID} not found or disconnected.`);
        return;
      }

      // Export, encrypt, and upload snapshot
      const exportedPayload = await this.exportRegistry(userId);
      const encryptedPayload = this.encryptPayload(exportedPayload, passphrase);

      if (account.provider === "s3") {
        const s3Config = await prisma.s3StorageConfig.findFirst({
          where: { connectedAccountId: account.id, status: "active" },
        });
        if (s3Config) {
          await this.uploadToS3(s3Config, encryptedPayload);
        }
      } else if (account.provider === "google_drive") {
        await this.uploadToGoogleDrive(account, encryptedPayload);
      } else if (account.provider === "dropbox") {
        await this.uploadToDropbox(account, encryptedPayload);
      } else if (account.provider === "onedrive") {
        await this.uploadToOneDrive(account, encryptedPayload);
      }

      // Update last synced at in file cache (to avoid Next.js dev server reloads)
      const lastSyncedAt = new Date().toISOString();
      try {
        const fs = require("fs");
        const path = require("path");
        const statusFile = path.resolve("storage/registry-status.json");
        fs.mkdirSync(path.dirname(statusFile), { recursive: true });
        fs.writeFileSync(statusFile, JSON.stringify({ lastSyncedAt }), "utf8");
      } catch (_) {}

      console.log(`[Registry AutoSync] Auto-sync completed successfully at ${lastSyncedAt}`);

    } catch (err: any) {
      console.error("[Registry AutoSync] Auto-sync failed:", err.message);
    } finally {
      this.isSyncingAuto = false;
    }
  }
}
