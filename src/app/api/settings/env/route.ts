import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { readEnv, writeEnv } from "@/lib/env-writer";
import { encrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = readEnv();
    // Return all env config keys. Values are masked for sensitive fields if desired,
    // but since this is single-user self-hosted on localhost, direct display is more convenient.
    return NextResponse.json({ env });
  } catch (err: any) {
    console.error("GET env settings error:", err);
    return NextResponse.json({ error: "Failed to load environment settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { env } = body;

    if (!env) {
      return NextResponse.json({ error: "Environment payload required" }, { status: 400 });
    }

    // Write updates to .env file
    writeEnv(env);

    // Sync google drive provider configurations in provider_configs
    if (env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET) {
      const activeConfig = await prisma.providerConfig.findFirst({
        where: { provider: "google_drive", status: "active" },
      });

      const redirectUri = env.GOOGLE_REDIRECT_URI || activeConfig?.redirectUri || "http://localhost:3000/api/oauth/google/callback";
      
      const updateData: any = {
        redirectUri,
      };

      if (env.GOOGLE_CLIENT_ID) {
        updateData.clientIdEncrypted = encrypt(env.GOOGLE_CLIENT_ID);
      }
      if (env.GOOGLE_CLIENT_SECRET) {
        updateData.clientSecretEncrypted = encrypt(env.GOOGLE_CLIENT_SECRET);
      }

      if (activeConfig) {
        await prisma.providerConfig.update({
          where: { id: activeConfig.id },
          data: updateData,
        });
      } else if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
        await prisma.providerConfig.create({
          data: {
            userId: user.id,
            provider: "google_drive",
            clientIdEncrypted: encrypt(env.GOOGLE_CLIENT_ID),
            clientSecretEncrypted: encrypt(env.GOOGLE_CLIENT_SECRET),
            redirectUri,
            scopes: JSON.stringify([
              "https://www.googleapis.com/auth/drive",
              "https://www.googleapis.com/auth/userinfo.email",
              "https://www.googleapis.com/auth/userinfo.profile"
            ]),
            status: "active",
          },
        });
      }
    }

    // Sync onedrive provider configurations in provider_configs
    if (env.ONEDRIVE_CLIENT_ID || env.ONEDRIVE_CLIENT_SECRET) {
      const activeConfig = await prisma.providerConfig.findFirst({
        where: { provider: "onedrive", status: "active" },
      });

      const redirectUri = env.ONEDRIVE_REDIRECT_URI || activeConfig?.redirectUri || "http://localhost:3000/api/oauth/onedrive/callback";
      
      const updateData: any = {
        redirectUri,
      };

      if (env.ONEDRIVE_CLIENT_ID) {
        updateData.clientIdEncrypted = encrypt(env.ONEDRIVE_CLIENT_ID);
      }
      if (env.ONEDRIVE_CLIENT_SECRET) {
        updateData.clientSecretEncrypted = encrypt(env.ONEDRIVE_CLIENT_SECRET);
      }
      if (env.ONEDRIVE_SCOPES) {
        updateData.scopes = JSON.stringify(env.ONEDRIVE_SCOPES.split(" "));
      }

      if (activeConfig) {
        await prisma.providerConfig.update({
          where: { id: activeConfig.id },
          data: updateData,
        });
      } else if (env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET) {
        await prisma.providerConfig.create({
          data: {
            userId: user.id,
            provider: "onedrive",
            clientIdEncrypted: encrypt(env.ONEDRIVE_CLIENT_ID),
            clientSecretEncrypted: encrypt(env.ONEDRIVE_CLIENT_SECRET),
            redirectUri,
            scopes: JSON.stringify((env.ONEDRIVE_SCOPES || "offline_access Files.ReadWrite User.Read").split(" ")),
            status: "active",
          },
        });
      }
    }

    // Sync dropbox provider configurations in provider_configs
    if (env.DROPBOX_CLIENT_ID || env.DROPBOX_CLIENT_SECRET) {
      const activeConfig = await prisma.providerConfig.findFirst({
        where: { provider: "dropbox", status: "active" },
      });

      const redirectUri = env.DROPBOX_REDIRECT_URI || activeConfig?.redirectUri || "http://localhost:3000/api/oauth/dropbox/callback";
      
      const updateData: any = {
        redirectUri,
      };

      if (env.DROPBOX_CLIENT_ID) {
        updateData.clientIdEncrypted = encrypt(env.DROPBOX_CLIENT_ID);
      }
      if (env.DROPBOX_CLIENT_SECRET) {
        updateData.clientSecretEncrypted = encrypt(env.DROPBOX_CLIENT_SECRET);
      }
      if (env.DROPBOX_SCOPES) {
        updateData.scopes = JSON.stringify(env.DROPBOX_SCOPES.split(" "));
      }

      if (activeConfig) {
        await prisma.providerConfig.update({
          where: { id: activeConfig.id },
          data: updateData,
        });
      } else if (env.DROPBOX_CLIENT_ID && env.DROPBOX_CLIENT_SECRET) {
        await prisma.providerConfig.create({
          data: {
            userId: user.id,
            provider: "dropbox",
            clientIdEncrypted: encrypt(env.DROPBOX_CLIENT_ID),
            clientSecretEncrypted: encrypt(env.DROPBOX_CLIENT_SECRET),
            redirectUri,
            scopes: JSON.stringify((env.DROPBOX_SCOPES || "files.metadata.read files.content.write files.content.read").split(" ")),
            status: "active",
          },
        });
      }
    }

    return NextResponse.json({ success: true, message: "System environment variables updated successfully." });
  } catch (err: any) {
    console.error("POST env settings error:", err);
    return NextResponse.json({ error: err.message || "Failed to save settings." }, { status: 500 });
  }
}
