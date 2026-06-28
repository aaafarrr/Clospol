import prisma from "@/lib/db";
import { ConnectedAccount, Folder } from "@prisma/client";

export class MessengerFolderService {
  /**
   * Resolve or recursively create the nested integration folder structure in SQLite:
   * Root (e.g. "WhatsApp - BotName") -> Chat Type ("Groups" / "Personal") -> Chat Name -> YYYY-MM
   */
  static async getOrCreateFolderPath(
    userId: string,
    storageAccount: ConnectedAccount,
    integrationProvider: string,
    integrationName: string,
    chatType: "Groups" | "Personal",
    chatName: string
  ): Promise<Folder> {
    const yearMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

    // 1. Root Integration Folder
    let providerLabel = "WhatsApp";
    if (integrationProvider === "telegram") {
      providerLabel = "Telegram";
    } else if (integrationProvider === "discord") {
      providerLabel = "Discord";
    } else if (integrationProvider === "slack") {
      providerLabel = "Slack";
    }

    const rootFolderName = `${providerLabel} - ${integrationName}`;
    let rootFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: null,
        name: rootFolderName,
        deletedAt: null,
      },
    });

    if (!rootFolder) {
      rootFolder = await prisma.folder.create({
        data: {
          userId,
          name: rootFolderName,
          parentId: null,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#3b82f6",
          iconUrl: "https://api.iconify.design/lucide:comments.svg",
        },
      });
    }

    // 2. Chat Type Folder (Groups / Personal)
    let typeFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: rootFolder.id,
        name: chatType,
        deletedAt: null,
      },
    });

    if (!typeFolder) {
      typeFolder = await prisma.folder.create({
        data: {
          userId,
          name: chatType,
          parentId: rootFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#10b981",
          iconUrl: "https://api.iconify.design/lucide:folder.svg",
        },
      });
    }

    // 3. Chat Sender Name Folder
    let chatFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: typeFolder.id,
        name: chatName,
        deletedAt: null,
      },
    });

    if (!chatFolder) {
      chatFolder = await prisma.folder.create({
        data: {
          userId,
          name: chatName,
          parentId: typeFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#8b5cf6",
          iconUrl: "https://api.iconify.design/lucide:user.svg",
        },
      });
    }

    // 4. Year-Month Folder
    let monthFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: chatFolder.id,
        name: yearMonth,
        deletedAt: null,
      },
    });

    if (!monthFolder) {
      monthFolder = await prisma.folder.create({
        data: {
          userId,
          name: yearMonth,
          parentId: chatFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#64748b",
          iconUrl: "https://api.iconify.design/lucide:calendar.svg",
        },
      });
    }

    return monthFolder;
  }
}
