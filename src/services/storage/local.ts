import fs from "fs";
import path from "path";
import { Readable, Writable } from "stream";
import prisma from "@/lib/db";
import { LocalStorageConfig, File } from "@prisma/client";

export class LocalStorageService {
  /**
   * Get active local storage configuration for a connected account.
   */
  static async getLocalConfigForAccount(accountId: string, userId?: string) {
    const config = await prisma.localStorageConfig.findFirst({
      where: {
        connectedAccountId: accountId,
        status: "active",
        ...(userId && { userId }),
      },
    });

    if (!config) {
      throw new Error(`Active Local Storage Config not found for account: ${accountId}`);
    }

    return config;
  }

  /**
   * Test read/write connectivity of a local directory path.
   */
  static async testLocalConnection(dirPath: string): Promise<void> {
    const resolvedPath = path.resolve(dirPath);

    // 1. Create directory if missing
    if (!fs.existsSync(resolvedPath)) {
      try {
        fs.mkdirSync(resolvedPath, { recursive: true, mode: 0o755 });
      } catch (err: any) {
        throw new Error(`Directory does not exist and could not be created: ${err.message}`);
      }
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new Error(`The configured path exists but is not a directory.`);
    }

    // 2. Test read/write permissions using a temporary file
    const tempFile = path.join(resolvedPath, `.clospol_test_${Math.random().toString(36).substring(7)}`);
    try {
      fs.writeFileSync(tempFile, "test-connection");
      fs.readFileSync(tempFile, "utf8");
      fs.unlinkSync(tempFile);
    } catch (err: any) {
      throw new Error(`Directory does not have valid read/write permissions: ${err.message}`);
    }
  }

  /**
   * Build the physical target file path which acts as the provider_file_id.
   */
  static buildLocalFileId(config: LocalStorageConfig, userId: string, fileId: string, fileName: string): string {
    const cleanPath = config.serverPath.replace(/[\\/]+$/, "");
    const safeName = fileName
      .replace(/[\\/]+/g, "-") // replace slashes with hyphens
      .replace(/[\x00-\x1F\x7F]+/g, "") // strip control characters
      .substring(0, 180); // cap filename size
    
    return path.join(cleanPath, userId, fileId, safeName || "file");
  }

  /**
   * Stream write a file into the local directory.
   */
  static async uploadLocalFile(config: LocalStorageConfig, targetFilePath: string, stream: Readable): Promise<void> {
    const resolvedPath = path.resolve(targetFilePath);
    const parentDir = path.dirname(resolvedPath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
    }

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(resolvedPath);
      stream.pipe(dest);

      dest.on("finish", resolve);
      dest.on("error", (err) => {
        dest.close();
        reject(new Error(`Failed to write local file: ${err.message}`));
      });
      stream.on("error", (err) => {
        dest.close();
        reject(err);
      });
    });
  }

  /**
   * Resolve local file path dynamically to account for server migrations or platform path variations.
   */
  static resolveLocalFilePath(file: File): string {
    let filePath = path.resolve(file.providerFileId);
    if (!fs.existsSync(filePath)) {
      try {
        const { sqlite } = require("@/db");
        const row = sqlite.prepare(
          "SELECT server_path FROM local_storage_configs WHERE connected_account_id = ? AND status = 'active'"
        ).get(file.connectedAccountId);
        
        if (row && row.server_path) {
          const parts = file.providerFileId.split(/[\\/]/);
          const len = parts.length;
          if (len >= 3) {
            const userId = parts[len - 3];
            const fileId = parts[len - 2];
            const fileName = parts[len - 1];
            
            const resolvedPath = path.join(row.server_path, userId, fileId, fileName);
            if (fs.existsSync(resolvedPath)) {
              filePath = resolvedPath;
            }
          }
        }
      } catch (err: any) {
        console.warn("[LocalStorageService] Dynamic path resolution warning:", err.message);
      }
    }
    return filePath;
  }

  /**
   * Delete local file and clean up empty parent directories up to 2 levels.
   */
  static async deleteLocalFile(file: File): Promise<void> {
    const filePath = this.resolveLocalFilePath(file);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);

      // Clean empty folder: user_id/file_id/
      const fileDir = path.dirname(filePath);
      if (fs.existsSync(fileDir) && fs.readdirSync(fileDir).length === 0) {
        fs.rmdirSync(fileDir);

        // Clean empty folder: user_id/
        const userDir = path.dirname(fileDir);
        if (fs.existsSync(userDir) && fs.readdirSync(userDir).length === 0) {
          fs.rmdirSync(userDir);
        }
      }
    }
  }

  /**
   * Calculate total bytes consumed by local storage and update StorageAccount status.
   */
  static async syncLocalQuota(accountId: string) {
    const config = await this.getLocalConfigForAccount(accountId);

    const result = await prisma.file.aggregate({
      _sum: {
        sizeBytes: true,
      },
      where: {
        connectedAccountId: accountId,
        status: "active",
        deletedAt: null,
      },
    });

    const usedBytes = Number(result._sum.sizeBytes || 0n);
    const quota = config.quotaBytes ? Number(config.quotaBytes) : null;
    const used = usedBytes;
    const available = quota !== null ? quota - used : null;

    return prisma.storageAccount.upsert({
      where: { connectedAccountId: accountId },
      create: {
        connectedAccountId: accountId,
        totalBytes: quota,
        usedBytes: used,
        availableBytes: available,
        lastSyncedAt: new Date(),
      },
      update: {
        totalBytes: quota,
        usedBytes: used,
        availableBytes: available,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Open a readable stream to download or preview a local file.
   */
  static streamLocalFile(file: File): Readable {
    const filePath = this.resolveLocalFilePath(file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`The requested file does not exist on local disk.`);
    }

    return fs.createReadStream(filePath);
  }

  /**
   * Sync local storage files with SQLite DB metadata.
   */
  static async syncLocalFiles(accountId: string, userId: string) {
    const config = await this.getLocalConfigForAccount(accountId, userId);
    const resolvedPath = path.resolve(config.serverPath);
    const userPath = path.join(resolvedPath, userId);

    const localFiles: Array<{ path: string; relativePath: string; name: string; sizeBytes: number; lastModified: Date }> = [];

    const listFilesRecursive = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const list = fs.readdirSync(dir);
      for (const item of list) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          listFilesRecursive(fullPath);
        } else {
          // Calculate relative path from userPath
          const rel = path.relative(userPath, fullPath).replace(/\\/g, "/");
          // rel will be folderId/fileName
          const parts = rel.split("/");
          if (parts.length < 2) continue; // must have folderId/fileName
          const fileId = parts[0];
          const fileName = parts.slice(1).join("/");

          localFiles.push({
            path: fullPath,
            relativePath: rel,
            name: fileName,
            sizeBytes: stat.size,
            lastModified: stat.mtime,
          });
        }
      }
    };

    try {
      listFilesRecursive(userPath);
    } catch (err: any) {
      console.error(`Failed to list files recursively for local path: ${err.message}`);
    }

    // Sync database
    const existingFiles = await prisma.file.findMany({
      where: {
        userId,
        connectedAccountId: accountId,
        provider: "local",
      },
    });

    const existingByProviderId = new Map<string, any>(existingFiles.map((f: any) => [f.providerFileId, f]));
    
    // We match by the normalized providerFileId (absolute path)
    const localFilePaths = new Set(localFiles.map((f) => path.resolve(f.path)));

    let created = 0;
    let updated = 0;
    let deleted = 0;

    for (const localFile of localFiles) {
      const absolutePath = path.resolve(localFile.path);
      const existing = existingByProviderId.get(absolutePath);
      if (!existing) {
        // Parse folderId (UUID) from relative path
        const fileId = localFile.relativePath.split("/")[0];
        
        await prisma.file.create({
          data: {
            id: (fileId && fileId.length === 36) ? fileId : undefined,
            userId,
            connectedAccountId: accountId,
            provider: "local",
            providerFileId: absolutePath,
            name: localFile.name,
            mimeType: "application/octet-stream",
            sizeBytes: localFile.sizeBytes,
            status: "active",
            isStarred: false,
            createdAt: localFile.lastModified,
            updatedAt: localFile.lastModified,
          },
        });
        created++;
      } else {
        const needsUpdate =
          existing.name !== localFile.name ||
          Number(existing.sizeBytes) !== localFile.sizeBytes ||
          existing.status !== "active" ||
          existing.deletedAt !== null;

        if (needsUpdate) {
          await prisma.file.update({
            where: { id: existing.id },
            data: {
              name: localFile.name,
              sizeBytes: localFile.sizeBytes,
              status: "active",
              deletedAt: null,
              updatedAt: localFile.lastModified,
            },
          });
          updated++;
        }
      }
    }

    // Mark missing active files as deleted
    const missingActiveIds = existingFiles
      .filter((f) => f.status === "active" && !localFilePaths.has(path.resolve(f.providerFileId)))
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
      await this.syncLocalQuota(accountId);
    } catch (err: any) {
      console.warn(`Failed to sync local quota during file sync: ${err.message}`);
    }

    return {
      accountId,
      created,
      updated,
      deleted,
    };
  }
}
