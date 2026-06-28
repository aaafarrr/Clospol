import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { GoogleDriveService } from "@/services/storage/google";
import { signToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const providerConfigId = searchParams.get("providerConfigId");

    let config;
    if (providerConfigId) {
      config = await prisma.providerConfig.findFirst({
        where: { id: providerConfigId, provider: "google_drive", status: "active" },
      });
    } else {
      config = await prisma.providerConfig.findFirst({
        where: { provider: "google_drive", status: "active" },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!config) {
      return NextResponse.json({ code: "GOOGLE_CONFIG_NOT_FOUND", message: "Google Drive OAuth Client Credentials are not configured in system settings." }, { status: 404 });
    }

    const statePayload = {
      userId: user.id,
      providerConfigId: config.id,
      action: "connect",
    };

    // Signed state valid for 10 minutes (600s)
    const state = signToken(statePayload, 600);

    const client = await GoogleDriveService.createOAuthClient(config);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: JSON.parse(config.scopes),
      state: state,
    });

    return NextResponse.json({ url });

  } catch (err: any) {
    console.error("Get google connect url error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
