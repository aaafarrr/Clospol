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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json({ error: "Image payload is required" }, { status: 400 });
    }

    const camera = await prisma.cctvCamera.findFirst({
      where: { id, userId: user.id },
    });

    if (!camera) {
      return NextResponse.json({ error: "CCTV Camera not found" }, { status: 404 });
    }

    await CctvService.uploadClientSnapshot(camera, image);
    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Client CCTV snapshot upload error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
