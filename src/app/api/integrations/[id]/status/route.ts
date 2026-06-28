import { NextRequest, NextResponse } from "next/server";
import { MessengerDaemon } from "@/services/messenger/daemon";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const statusInfo = MessengerDaemon.getWhatsAppStatus(id);
    return NextResponse.json({ status: statusInfo.status, qr: statusInfo.qr });
  } catch (err: any) {
    console.error("GET whatsapp status error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
