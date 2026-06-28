import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { CctvService } from "@/services/cctv/cctv";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { streamUrl, snapshotUrl, headers } = body;

    if (!streamUrl) {
      return NextResponse.json({ error: "streamUrl is required" }, { status: 400 });
    }

    try {
      await CctvService.testConnection(streamUrl, snapshotUrl || null, headers || {});
      return NextResponse.json({ status: "ok" });
    } catch (testErr: any) {
      return NextResponse.json(
        { error: testErr.message || "Connection test failed." },
        { status: 400 }
      );
    }

  } catch (err: any) {
    console.error("CCTV test-connection error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
