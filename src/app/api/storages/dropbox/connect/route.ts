import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { decrypt } from "@/lib/crypto";

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
        where: { id: providerConfigId, provider: "dropbox", status: "active" },
      });
    } else {
      config = await prisma.providerConfig.findFirst({
        where: { provider: "dropbox", status: "active" },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!config) {
      const redirectUrl = new URL("/settings/drives?status=error", req.url);
      return NextResponse.redirect(redirectUrl);
    }

    const statePayload = {
      userId: user.id,
      providerConfigId: config.id,
      action: "connect",
    };

    const state = signToken(statePayload, 600);
    const clientId = decrypt(config.clientIdEncrypted);

    const authUrl = `https://www.dropbox.com/oauth2/authorize?` + new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      token_access_type: "offline",
      state: state,
    }).toString();

    return NextResponse.redirect(authUrl);

  } catch (err: any) {
    console.error("Dropbox connect redirect error:", err);
    const redirectUrl = new URL("/settings/drives?status=error", req.url);
    return NextResponse.redirect(redirectUrl);
  }
}
