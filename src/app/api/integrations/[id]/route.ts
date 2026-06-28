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
