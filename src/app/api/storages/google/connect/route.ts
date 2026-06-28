import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { GoogleDriveService } from "@/services/storage/google";
import { signToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      const url = new URL("/login", req.url);
      return NextResponse.redirect(url);
    }

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
      const redirectUrl = new URL("/settings?status=error", req.url);
      return NextResponse.redirect(redirectUrl);
    }

    const statePayload = {
      userId: user.id,
      providerConfigId: config.id,
      action: "connect",
    };

    const state = signToken(statePayload, 600);

    const client = await GoogleDriveService.createOAuthClient(config);
    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: JSON.parse(config.scopes),
      state: state,
    });

    return NextResponse.redirect(authUrl);

  } catch (err: any) {
    console.error("Google connect redirect error:", err);
    const redirectUrl = new URL("/settings?status=error", req.url);
    return NextResponse.redirect(redirectUrl);
  }
}
