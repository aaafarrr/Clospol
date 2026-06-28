import prisma from "@/lib/db";
import { LocalStorageService } from "./local";
import { S3StorageService } from "./s3";
import { GoogleDriveService } from "./google";

export class TrashCleanupService {
  /**
   * Scans and permanently deletes files and folders that have been soft-deleted for over 30 days.
   */
  static async runCleanup() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // 1. Fetch expired folders
      const expiredFolders = await prisma.folder.findMany({
        where: {
          deletedAt: { lt: thirtyDaysAgo }
        }
      });

      if (expiredFolders.length > 0) {
        console.log(`[Trash Cleanup] Found ${expiredFolders.length} expired folders. Cleaning up...`);
      }

      for (const folder of expiredFolders) {
        // Double check if folder still exists (might have been deleted by parent folder cleanup)
        const exists = await prisma.folder.findUnique({ where: { id: folder.id } });
        if (!exists) continue;

        // Perform permanent folder deletion logic
        const folderIds = await this.getDescendantFolderIds(folder.id, folder.userId);

        const files = await prisma.file.findMany({
          where: {
            userId: folder.userId,
            folderId: { in: folderIds }
          }
        });

        // Delete descendant files physically
        for (const file of files) {
          try {
            const { StorageCoordinator } = await import("./coordinator");
            await StorageCoordinator.deleteFile(file);
          } catch (err: any) {
            console.warn(`[Trash Cleanup] Physical deletion failed for file ${file.id}: ${err.message}`);
          }
        }

        // Delete from database
        await prisma.$transaction([
          prisma.file.deleteMany({
            where: {
              userId: folder.userId,
              id: { in: files.map(f => f.id) }
            }
          }),
          prisma.folder.deleteMany({
            where: {
              userId: folder.userId,
              id: { in: folderIds }
            }
          })
        ]);
      }

      // 2. Fetch expired files
      const expiredFiles = await prisma.file.findMany({
        where: {
          status: "deleted",
          deletedAt: { lt: thirtyDaysAgo }
        }
      });

      if (expiredFiles.length > 0) {
        console.log(`[Trash Cleanup] Found ${expiredFiles.length} expired files. Cleaning up...`);
      }

      for (const file of expiredFiles) {
        const exists = await prisma.file.findUnique({ where: { id: file.id } });
        if (!exists) continue;

        try {
          const { StorageCoordinator } = await import("./coordinator");
          await StorageCoordinator.deleteFile(file);
        } catch (err: any) {
          console.warn(`[Trash Cleanup] Physical deletion failed for file ${file.id}: ${err.message}`);
        }

        await prisma.file.delete({ where: { id: file.id } });
      }

      if (expiredFolders.length > 0 || expiredFiles.length > 0) {
        console.log(`[Trash Cleanup] Completed successfully.`);
      }
    } catch (err: any) {
      console.error(`[Trash Cleanup] Error:`, err);
    }
  }

  private static async getDescendantFolderIds(rootId: string, userId: string): Promise<string[]> {
    const allFolders = await prisma.folder.findMany({
      where: { userId },
      select: { id: true, parentId: true }
    });

    const descendantIds = [rootId];
    let changed = true;
    while (changed) {
      changed = false;
      for (const folder of allFolders) {
        if (folder.parentId && descendantIds.includes(folder.parentId) && !descendantIds.includes(folder.id)) {
          descendantIds.push(folder.id);
          changed = true;
        }
      }
    }
    return descendantIds;
  }
}
