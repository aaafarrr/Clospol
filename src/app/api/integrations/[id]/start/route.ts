import { NextRequest, NextResponse } from "next/server";
import { MessengerDaemon } from "@/services/messenger/daemon";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Boot WhatsApp session connection in background
    MessengerDaemon.startWhatsAppSession(id).catch((err) => {
      console.error(`Failed to start WhatsApp session ${id} in background:`, err);
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST start whatsapp error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
