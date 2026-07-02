import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { MessengerDaemon } from "@/services/messenger/daemon";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const integration = await prisma.messengerIntegration.findFirst({
      where: { id, userId: user.id },
    });

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    // Stop background listeners
    if (integration.provider === "whatsapp" && integration.sessionId) {
      await MessengerDaemon.stopWhatsAppSession(integration.sessionId);
    } else if (integration.provider === "discord") {
      await MessengerDaemon.stopDiscordClient(integration.id);
    }

    await prisma.messengerIntegration.delete({ where: { id: integration.id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE messenger integration error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;
    const body = await req.json();
    const { integrationName, botToken } = body;

    const integration = await prisma.messengerIntegration.findFirst({
      where: { id, userId: user.id },
    });

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (integrationName !== undefined && integrationName.trim()) {
      updateData.integrationName = integrationName.trim();
    }

    if (botToken !== undefined && botToken.trim()) {
      const { encrypt } = require("@/lib/crypto");
      updateData.botTokenEncrypted = encrypt(botToken.trim());
    }

    const updated = await prisma.messengerIntegration.update({
      where: { id: integration.id },
      data: updateData,
    });

    // If Discord bot token is updated, restart client daemon with the new token
    if (integration.provider === "discord" && botToken !== undefined && botToken.trim()) {
      try {
        await MessengerDaemon.stopDiscordClient(integration.id);
        await MessengerDaemon.startDiscordClient(integration.id, botToken.trim());
        await prisma.messengerIntegration.update({
          where: { id: integration.id },
          data: { status: "active" },
        });
      } catch (clientErr: any) {
        console.error("Failed to restart Discord bot with new token:", clientErr);
      }
    }

    return NextResponse.json({ success: true, integration: updated });
  } catch (err: any) {
    console.error("PATCH messenger integration error:", err);
    return NextResponse.json({ error: err.message || "Failed to update integration" }, { status: 500 });
  }
}
