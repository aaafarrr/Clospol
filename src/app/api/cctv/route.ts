import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { CctvService } from "@/services/cctv/cctv";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cameras = await prisma.cctvCamera.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const formattedCameras = cameras.map((cam) => {
      let snapshotHeadersObj = {};
      if (cam.snapshotHeaders) {
        try {
          snapshotHeadersObj = JSON.parse(cam.snapshotHeaders);
        } catch (e) {}
      }

      return {
        id: cam.id,
        name: cam.name,
        streamUrl: cam.streamUrl,
        snapshotUrl: cam.snapshotUrl,
        scheduleCron: cam.scheduleCron,
        recordStream: cam.recordStream,
        recordInterval: cam.recordInterval,
        retentionDays: cam.retentionDays,
        status: cam.status,
        connectedAccountId: cam.connectedAccountId,
        snapshotHeaders: snapshotHeadersObj,
        lastCaptureAt: cam.lastCaptureAt ? cam.lastCaptureAt.toISOString() : null,
        lastCaptureStatus: cam.lastCaptureStatus,
        lastCaptureError: cam.lastCaptureError,
      };
    });

    return NextResponse.json({ cameras: formattedCameras });
  } catch (err: any) {
    console.error("GET CCTV cameras error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      streamUrl,
      snapshotUrl,
      scheduleCron,
      recordStream,
      recordInterval,
      retentionDays,
      connectedAccountId,
      headers,
    } = body;

    if (!name || !streamUrl) {
      return NextResponse.json({ error: "Name and Stream URL are required" }, { status: 400 });
    }

    // Verify camera connection
    try {
      await CctvService.testConnection(streamUrl, snapshotUrl || null, headers || {});
    } catch (testErr: any) {
      return NextResponse.json(
        { error: `Connection verification failed: ${testErr.message}` },
        { status: 400 }
      );
    }

    const camera = await prisma.cctvCamera.create({
      data: {
        userId: user.id,
        name,
        streamUrl,
        snapshotUrl: snapshotUrl || null,
        snapshotHeaders: headers ? JSON.stringify(headers) : null,
        scheduleCron: scheduleCron || null,
        recordStream: !!recordStream,
        recordInterval: recordInterval ? Number(recordInterval) : 5,
        retentionDays: retentionDays ? Number(retentionDays) : 7,
        connectedAccountId: connectedAccountId === "routing_policy" ? null : connectedAccountId,
        status: "active",
      },
    });

    // Synchronize background captures/recordings
    CctvService.syncScheduledTasks().catch((err) => {
      console.error("CCTV scheduler sync failed:", err);
    });

    return NextResponse.json({ camera }, { status: 201 });
  } catch (err: any) {
    console.error("POST CCTV camera error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
