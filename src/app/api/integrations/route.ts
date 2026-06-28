import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { MessengerDaemon } from "@/services/messenger/daemon";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const integrations = await prisma.messengerIntegration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const formatted = integrations.map((item) => ({
      id: item.id,
      provider: item.provider,
      integrationName: item.integrationName,
      status: item.status,
      isActive: item.isActive,
      sessionId: item.sessionId,
      lastError: item.lastError,
    }));

    return NextResponse.json({ integrations: formatted });
  } catch (err: any) {
    console.error("GET messenger integrations error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { provider, integrationName, botToken, sessionId } = body;

    if (!provider || !integrationName) {
      return NextResponse.json({ error: "Provider and Integration Name are required" }, { status: 400 });
    }

    const encryptedToken = botToken ? encrypt(botToken) : "";
    const cleanSessionId = sessionId || `session_${Math.random().toString(36).substring(2)}`;

    const integration = await prisma.messengerIntegration.create({
      data: {
        userId: user.id,
        provider,
        integrationName,
        botTokenEncrypted: encryptedToken,
        sessionId: provider === "whatsapp" ? cleanSessionId : null,
        status: "inactive",
        isActive: true,
      },
    });

    // Auto-boot Discord client on creation
    if (provider === "discord" && botToken) {
      try {
        await MessengerDaemon.startDiscordClient(integration.id, botToken);
        await prisma.messengerIntegration.update({
          where: { id: integration.id },
          data: { status: "active" },
        });
      } catch (clientErr: any) {
        console.error("Failed to boot Discord bot client on creation:", clientErr);
      }
    }

    return NextResponse.json({ integration }, { status: 201 });
  } catch (err: any) {
    console.error("POST messenger integration error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
