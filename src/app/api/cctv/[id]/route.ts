import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { CctvService } from "@/services/cctv/cctv";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: cameraId } = await params;
    const body = await req.json();
    const { 
      name, 
      streamUrl, 
      snapshotUrl, 
      recordStream, 
      recordInterval, 
      retentionDays, 
      scheduleCron,
      connectedAccountId,
      headers
    } = body;

    const camera = await prisma.cctvCamera.findFirst({
      where: { id: cameraId, userId: user.id },
    });

    if (!camera) {
      return NextResponse.json({ error: "CCTV Camera not found" }, { status: 404 });
    }

    if (!name || !streamUrl) {
      return NextResponse.json({ error: "Name and Stream URL are required" }, { status: 400 });
    }

    const updatedCamera = await prisma.cctvCamera.update({
      where: { id: camera.id },
      data: {
        name,
        streamUrl,
        snapshotUrl: snapshotUrl || null,
        snapshotHeaders: headers ? JSON.stringify(headers) : null,
        recordStream: recordStream ?? false,
        recordInterval: recordInterval ? parseInt(recordInterval) : 5,
        retentionDays: retentionDays ? parseInt(retentionDays) : 7,
        scheduleCron: scheduleCron || null,
        connectedAccountId: connectedAccountId === "routing_policy" ? null : connectedAccountId,
      },
    });

    // Synchronize scheduled captures for cameras
    CctvService.syncScheduledTasks().catch((err) => {
      console.error("CCTV scheduler sync failed:", err);
    });

    return NextResponse.json({
      message: "CCTV Camera configuration updated successfully.",
      camera: updatedCamera,
    });

  } catch (err: any) {
    console.error("Update CCTV Camera error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: cameraId } = await params;

    const camera = await prisma.cctvCamera.findFirst({
      where: { id: cameraId, userId: user.id },
    });

    if (!camera) {
      return NextResponse.json({ error: "CCTV Camera not found" }, { status: 404 });
    }

    await prisma.cctvCamera.delete({
      where: { id: camera.id },
    });

    // Synchronize scheduled captures for cameras
    CctvService.syncScheduledTasks().catch((err) => {
      console.error("CCTV scheduler sync failed:", err);
    });

    return NextResponse.json({
      message: "CCTV Camera deleted successfully.",
    });

  } catch (err: any) {
    console.error("Delete CCTV Camera error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
