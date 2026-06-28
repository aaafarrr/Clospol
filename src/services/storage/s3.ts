import { S3Client, HeadBucketCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { S3StorageConfig, File } from "@prisma/client";

export class S3StorageService {
  /**
   * Instantiate an AWS S3 client using decrypted credentials.
   */
  static createS3Client(config: S3StorageConfig): S3Client {
    const key = decrypt(config.accessKeyIdEncrypted);
    const secret = decrypt(config.secretAccessKeyEncrypted);

    return new S3Client({
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
    });
  }

  /**
   * Fetch active S3 configuration for a connected account.
   */
  static async getS3ConfigForAccount(accountId: string, userId?: string) {
    const config = await prisma.s3StorageConfig.findFirst({
      where: {
        connectedAccountId: accountId,
        status: "active",
        ...(userId && { userId }),
      },
    });

    if (!config) {
      throw new Error(`Active S3 Storage Config not found for account: ${accountId}`);
    }

    return config;
  }

  /**
   * Test bucket connectivity by making a HeadBucket request.
   */
  static async testS3Connection(config: S3StorageConfig): Promise<void> {
    const client = this.createS3Client(config);
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  }

  /**
   * Build S3 Object Key.
   */
  static buildS3ObjectKey(config: S3StorageConfig, userId: string, fileId: string, fileName: string): string {
    const cleanPrefix = config.prefix.trim().replace(/[\\/]+$/, "");
    const safeName = fileName
      .replace(/[\\/]+/g, "-")
      .replace(/[\x00-\x1F\x7F]+/g, "")
      .substring(0, 180);

    return cleanPrefix ? `${cleanPrefix}/${userId}/${fileId}/${safeName}` : `${userId}/${fileId}/${safeName}`;
  }

  /**
   * Stream upload a file to S3 using multi-part upload helper.
   */
  static async uploadS3Object(config: S3StorageConfig, key: string, stream: Readable, mimeType: string): Promise<void> {
    const client = this.createS3Client(config);
    
    const upload = new Upload({
      client,
      params: {
        Bucket: config.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
      },
      queueSize: 4, // 4 concurrent parts
      partSize: 5 * 1024 * 1024, // 5MB part size
    });

    await upload.done();
  }

  /**
   * Delete an object from S3.
   */
  static async deleteS3Object(file: File): Promise<void> {
    const config = await this.getS3ConfigForAccount(file.connectedAccountId);
    const client = this.createS3Client(config);

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: file.providerFileId,
      })
    );
  }

  /**
   * Sync total bucket storage usage and update StorageAccount record.
   */
  static async syncS3Quota(accountId: string) {
    const config = await this.getS3ConfigForAccount(accountId);
    const client = this.createS3Client(config);

    let usedBytes = 0;
    let continuationToken: string | undefined = undefined;

    do {
      const response: any = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const object of response.Contents) {
          usedBytes += object.Size || 0;
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

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
   * Stream file from S3 (supports Range queries).
   */
  static async streamS3File(file: File, range?: string): Promise<Readable> {
    const config = await this.getS3ConfigForAccount(file.connectedAccountId);
    const client = this.createS3Client(config);

    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: file.providerFileId,
        Range: range,
      })
    );

    if (!response.Body) {
      throw new Error(`S3 object body is empty for file: ${file.name}`);
    }

    return response.Body as Readable;
  }

  /**
   * Sync S3 bucket files with SQLite DB metadata.
   */
  static async syncS3Files(accountId: string, userId: string) {
    const config = await this.getS3ConfigForAccount(accountId, userId);
    const client = this.createS3Client(config);

    const cleanPrefix = config.prefix.trim().replace(/[\\/]+$/, "");
    const userPrefix = cleanPrefix ? `${cleanPrefix}/${userId}/` : `${userId}/`;

    const s3Files: Array<{ key: string; name: string; sizeBytes: number; lastModified: Date }> = [];
    let continuationToken: string | undefined = undefined;

    do {
      const response: any = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: userPrefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const object of response.Contents) {
          if (!object.Key || object.Size === 0) continue;
          
          // Parse Key: prefix/userId/fileId/fileName
          const key = object.Key;
          const relativePath = key.substring(userPrefix.length);
          const parts = relativePath.split("/");
          if (parts.length < 2) continue; // Must have fileId and fileName
          
          const fileId = parts[0];
          const fileName = parts.slice(1).join("/");
          
          s3Files.push({
            key,
            name: fileName,
            sizeBytes: object.Size || 0,
            lastModified: object.LastModified || new Date(),
          });
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Sync database
    const existingFiles = await prisma.file.findMany({
      where: {
        userId,
        connectedAccountId: accountId,
        provider: "s3",
      },
    });

    const existingByProviderId = new Map<string, any>(existingFiles.map((f: any) => [f.providerFileId, f]));
    const s3FileKeys = new Set(s3Files.map((f) => f.key));

    let created = 0;
    let updated = 0;
    let deleted = 0;

    for (const s3File of s3Files) {
      const existing = existingByProviderId.get(s3File.key);
      if (!existing) {
        const relativePath = s3File.key.substring(userPrefix.length);
        const fileId = relativePath.split("/")[0];
        
        await prisma.file.create({
          data: {
            id: (fileId && fileId.length === 36) ? fileId : undefined,
            userId,
            connectedAccountId: accountId,
            provider: "s3",
            providerFileId: s3File.key,
            name: s3File.name,
            mimeType: "application/octet-stream",
            sizeBytes: s3File.sizeBytes,
            status: "active",
            isStarred: false,
            createdAt: s3File.lastModified,
            updatedAt: s3File.lastModified,
          },
        });
        created++;
      } else {
        const needsUpdate =
          existing.name !== s3File.name ||
          Number(existing.sizeBytes) !== s3File.sizeBytes ||
          existing.status !== "active" ||
          existing.deletedAt !== null;

        if (needsUpdate) {
          await prisma.file.update({
            where: { id: existing.id },
            data: {
              name: s3File.name,
              sizeBytes: s3File.sizeBytes,
              status: "active",
              deletedAt: null,
              updatedAt: s3File.lastModified,
            },
          });
          updated++;
        }
      }
    }

    // Mark missing active files as deleted
    const missingActiveIds = existingFiles
      .filter((f) => f.status === "active" && !s3FileKeys.has(f.providerFileId))
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
      await this.syncS3Quota(accountId);
    } catch (err: any) {
      console.warn(`Failed to sync S3 quota during file sync: ${err.message}`);
    }

    return {
      accountId,
      created,
      updated,
      deleted,
    };
  }
}
