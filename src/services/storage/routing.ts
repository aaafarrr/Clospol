import prisma from "@/lib/db";
import { ConnectedAccount } from "@prisma/client";
import { LocalStorageService } from "./local";
import { S3StorageService } from "./s3";
import { GoogleDriveService } from "./google";

export class UploadRoutingService {
  /**
   * Synchronize quota for a connected account.
   */
  static async syncAccountQuota(account: ConnectedAccount): Promise<void> {
    try {
      if (account.provider === "local") {
        await LocalStorageService.syncLocalQuota(account.id);
      } else if (account.provider === "s3") {
        await S3StorageService.syncS3Quota(account.id);
      } else if (account.provider === "google_drive") {
        await GoogleDriveService.syncGoogleQuota(account);
      } else if (account.provider === "dropbox") {
        const { DropboxService } = await import("./dropbox");
        await DropboxService.syncDropboxQuota(account);
      } else if (account.provider === "onedrive") {
        const { OneDriveService } = await import("./onedrive");
        await OneDriveService.syncOneDriveQuota(account);
      }
    } catch (err: any) {
      console.warn(`Failed to sync quota for account ${account.id} during routing evaluation: ${err.message}`);
    }
  }

  /**
   * Select a storage account for an upload based on the user's Upload Routing Policy.
   */
  static async selectRoutingAccount(userId: string, sizeBytes: number): Promise<ConnectedAccount> {
    // 1. Fetch connected storage accounts
    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId,
        provider: { in: ["google_drive", "onedrive", "dropbox", "s3", "local"] },
        status: "connected",
      },
      include: {
        storageAccount: true,
      },
    });

    if (accounts.length === 0) {
      throw new Error("No connected storage accounts found for this user.");
    }

    // 2. Refresh stale accounts (last synced > 5 minutes ago) in background/sequentially
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    for (const account of accounts) {
      const storage = account.storageAccount;
      const isStale = !storage || !storage.lastSyncedAt || storage.lastSyncedAt < fiveMinutesAgo;
      
      if (isStale) {
        await this.syncAccountQuota(account);
      }
    }

    // 3. Re-fetch fresh account metadata
    const freshAccounts = await prisma.connectedAccount.findMany({
      where: {
        userId,
        provider: { in: ["google_drive", "onedrive", "dropbox", "s3", "local"] },
        status: "connected",
      },
      include: {
        storageAccount: true,
      },
    });

    // 4. Filter eligible accounts that have enough available capacity
    const eligible: Array<{ account: ConnectedAccount; availableBytes: number | null }> = [];
    for (const account of freshAccounts) {
      const storage = account.storageAccount;
      const available = storage?.availableBytes !== undefined && storage.availableBytes !== null
        ? Number(storage.availableBytes)
        : null;

      // Eligible if storage capacity is unlimited (null) or has enough space
      if (available === null || available >= sizeBytes) {
        eligible.push({ account, availableBytes: available });
      }
    }

    // Fallback if no account satisfies the size constraints
    if (eligible.length === 0) {
      return freshAccounts[0];
    }

    // 5. Get user's routing policy
    let policy = await prisma.uploadRoutingPolicy.findUnique({
      where: { userId },
    });

    if (!policy) {
      policy = await prisma.uploadRoutingPolicy.create({
        data: {
          userId,
          mode: "most_available",
          priorityAccountIds: "[]",
          roundRobinCursor: 0,
        },
      });
    }

    const mode = policy.mode;
    let priorityIds: string[] = [];
    try {
      priorityIds = JSON.parse(policy.priorityAccountIds || "[]");
    } catch (_) {}

    // Sort helper: by Priority ID list
    const sortByPriority = (items: typeof eligible) => {
      const orderMap = new Map(priorityIds.map((id, index) => [id, index]));
      return [...items].sort((a, b) => {
        const aOrder = orderMap.get(a.account.id);
        const bOrder = orderMap.get(b.account.id);
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        return a.account.createdAt.getTime() - b.account.createdAt.getTime();
      });
    };

    switch (mode) {
      case "priority": {
        const sorted = sortByPriority(eligible);
        return sorted[0].account;
      }

      case "round_robin": {
        const sorted = sortByPriority(eligible);
        const index = policy.roundRobinCursor % sorted.length;
        
        // Increment round robin cursor in database
        await prisma.uploadRoutingPolicy.update({
          where: { id: policy.id },
          data: { roundRobinCursor: { increment: 1 } },
        });

        return sorted[index].account;
      }

      case "local_first": {
        const sorted = [...eligible].sort((a, b) => {
          const aLocal = a.account.provider === "local" ? 1 : 0;
          const bLocal = b.account.provider === "local" ? 1 : 0;
          if (aLocal !== bLocal) return bLocal - aLocal; // Local first

          // Fallback to capacity comparison
          if (a.availableBytes === null && b.availableBytes === null) return 0;
          if (a.availableBytes === null) return 1;
          if (b.availableBytes === null) return -1;
          return b.availableBytes - a.availableBytes; // Descending
        });
        return sorted[0].account;
      }

      case "cloud_first": {
        const sorted = [...eligible].sort((a, b) => {
          const aCloud = a.account.provider !== "local" ? 1 : 0;
          const bCloud = b.account.provider !== "local" ? 1 : 0;
          if (aCloud !== bCloud) return bCloud - aCloud; // Cloud first

          // Fallback to capacity comparison
          if (a.availableBytes === null && b.availableBytes === null) return 0;
          if (a.availableBytes === null) return 1;
          if (b.availableBytes === null) return -1;
          return b.availableBytes - a.availableBytes; // Descending
        });
        return sorted[0].account;
      }

      case "least_available": {
        const sorted = [...eligible].sort((a, b) => {
          if (a.availableBytes === null && b.availableBytes === null) return 0;
          if (a.availableBytes === null) return 1;
          if (b.availableBytes === null) return -1;
          return a.availableBytes - b.availableBytes; // Ascending
        });
        return sorted[0].account;
      }

      case "random": {
        const randomIndex = Math.floor(Math.random() * eligible.length);
        return eligible[randomIndex].account;
      }

      case "most_available":
      default: {
        const sorted = [...eligible].sort((a, b) => {
          if (a.availableBytes === null && b.availableBytes === null) return 0;
          if (a.availableBytes === null) return 1;
          if (b.availableBytes === null) return -1;
          return b.availableBytes - a.availableBytes; // Descending
        });
        return sorted[0].account;
      }
    }
  }
}
