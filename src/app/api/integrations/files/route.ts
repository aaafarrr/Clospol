import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get("integrationId") || null;

    let rootFolderNames: string[] = [];
    let activeIntegration = null;

    if (integrationId) {
      // 1. Fetch the specific integration
      const integration = await prisma.messengerIntegration.findFirst({
        where: { id: integrationId, userId: user.id },
      });

      if (!integration) {
        return NextResponse.json({ error: "Integration not found" }, { status: 404 });
      }

      activeIntegration = {
        id: integration.id,
        provider: integration.provider,
        integrationName: integration.integrationName,
      };

      let providerLabel = "WhatsApp";
      if (integration.provider === "telegram") providerLabel = "Telegram";
      else if (integration.provider === "discord") providerLabel = "Discord";
      else if (integration.provider === "slack") providerLabel = "Slack";
      rootFolderNames = [`${providerLabel} - ${integration.integrationName}`];
    } else {
      // 2. Fetch all integrations for the authenticated user
      const integrations = await prisma.messengerIntegration.findMany({
        where: { userId: user.id },
      });

      if (integrations.length === 0) {
        return NextResponse.json({ files: [], integration: null });
      }

      rootFolderNames = integrations.map((item) => {
        let providerLabel = "WhatsApp";
        if (item.provider === "telegram") providerLabel = "Telegram";
        else if (item.provider === "discord") providerLabel = "Discord";
        else if (item.provider === "slack") providerLabel = "Slack";
        return `${providerLabel} - ${item.integrationName}`;
      });
    }

    // 3. Fetch all active folders for the user
    const folders = await prisma.folder.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
    });

    // 4. Trace the folders hierarchy using BFS to list all integration folders (including nested ones)
    const integrationFolderIds = new Set<string>();
    const rootFolders = folders.filter((f) => !f.parentId && rootFolderNames.includes(f.name));

    const queue = [...rootFolders];
    while (queue.length > 0) {
      const current = queue.shift()!;
      integrationFolderIds.add(current.id);

      const children = folders.filter((f) => f.parentId === current.id);
      queue.push(...children);
    }

    if (integrationFolderIds.size === 0) {
      return NextResponse.json({ files: [], integration: activeIntegration });
    }

    // 5. Fetch all active (non-deleted) files belonging to these folders
    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        folderId: { in: Array.from(integrationFolderIds) },
        status: "active",
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    // SQLite uses BigInt for sizeBytes, serialize it to string for JSON parsing
    const formattedFiles = files.map((file) => ({
      ...file,
      sizeBytes: file.sizeBytes.toString(),
    }));

    return NextResponse.json({ files: formattedFiles, integration: activeIntegration });
  } catch (err: any) {
    console.error("GET integration files error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

