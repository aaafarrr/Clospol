import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { OnvifService } from "@/services/cctv/onvif";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { onvifUrl, onvifUsername, onvifPassword } = body;

    if (!onvifUrl) {
      return NextResponse.json({ error: "ONVIF Endpoint URL is required" }, { status: 400 });
    }

    try {
      const details = await OnvifService.connectAndFetch(onvifUrl, onvifUsername, onvifPassword);
      return NextResponse.json({
        status: "ok",
        deviceUrl: details.device_url,
        mediaUrl: details.media_url,
        profileToken: details.profile_token,
        rtspUrl: details.rtsp_url,
        snapshotUrl: details.snapshot_url,
      });
    } catch (onvifErr: any) {
      return NextResponse.json(
        { error: onvifErr.message || "Failed to connect to ONVIF service." },
        { status: 400 }
      );
    }

  } catch (err: any) {
    console.error("ONVIF API error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
