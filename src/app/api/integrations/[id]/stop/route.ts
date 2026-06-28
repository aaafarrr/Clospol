import { NextRequest, NextResponse } from "next/server";
import { MessengerDaemon } from "@/services/messenger/daemon";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await MessengerDaemon.stopWhatsAppSession(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST stop whatsapp error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
