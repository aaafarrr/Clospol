import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { RtspTranscoderService } from "@/services/cctv/rtsp-transcoder";

/**
 * GET: Starts the transcoding process for a camera (if it is RTSP)
 * and returns the browser-playable stream URL.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: cameraId } = await params;
    const camera = await prisma.cctvCamera.findFirst({
      where: { id: cameraId, userId: user.id },
    });

    if (!camera) {
      return NextResponse.json({ error: "CCTV Camera not found" }, { status: 404 });
    }

    const isRtsp = camera.streamUrl.toLowerCase().startsWith("rtsp://");
    let hlsUrl = camera.streamUrl;

    if (isRtsp) {
      // Start the background ffmpeg transcoder
      const relativeHlsPath = await RtspTranscoderService.startSession(camera.id, camera.streamUrl);
      hlsUrl = relativeHlsPath;
    }

    return NextResponse.json({
      hlsUrl,
      isRtsp
    });
  } catch (err: any) {
    console.error("[CCTV Stream Route GET Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

/**
 * POST: Keeps an active transcoding session alive (Client-side Heartbeat).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: cameraId } = await params;
    const keptAlive = RtspTranscoderService.keepAlive(cameraId);

    return NextResponse.json({ status: "ok", keptAlive });
  } catch (err: any) {
    console.error("[CCTV Stream Route POST Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

/**
 * DELETE: Explicitly stops the transcoding process and cleans up files.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: cameraId } = await params;
    RtspTranscoderService.stopSession(cameraId);

    return NextResponse.json({ status: "stopped" });
  } catch (err: any) {
    console.error("[CCTV Stream Route DELETE Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
