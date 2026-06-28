import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { signToken } from "@/lib/jwt";
import { decrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      return NextResponse.json({ code: "DROPBOX_CONFIG_NOT_FOUND", message: "Dropbox API Client Credentials are not configured in system settings." }, { status: 404 });
    }

    const statePayload = {
      userId: user.id,
      providerConfigId: config.id,
      action: "connect",
    };

    const state = signToken(statePayload, 600);
    const clientId = decrypt(config.clientIdEncrypted);

    const url = `https://www.dropbox.com/oauth2/authorize?` + new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      token_access_type: "offline",
      state: state,
    }).toString();

    return NextResponse.json({ url });
  } catch (err: any) {
    console.error("Get dropbox connect url error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
