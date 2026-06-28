import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { CctvService } from "@/services/cctv/cctv";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const camera = await prisma.cctvCamera.findFirst({
      where: { id, userId: user.id },
    });

    if (!camera) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }

    await CctvService.recordHlsClip(camera);
    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Manual CCTV record error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
