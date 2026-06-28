import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { DropboxService } from "@/services/storage/dropbox";
import { verifyToken } from "@/lib/jwt";
import { encrypt, decrypt } from "@/lib/crypto";

function renderHtmlResponse(status: "success" | "error", message: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Dropbox Integration</title>
      <style>
        body {
          background-color: #020617;
          color: #f8fafc;
          font-family: ui-sans-serif, system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          text-align: center;
          padding: 2rem;
          border-radius: 1.5rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(51, 65, 85, 0.5);
          backdrop-filter: blur(12px);
          max-width: 400px;
        }
        h1 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
        }
        p {
          color: #94a3b8;
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
        }
        .status-success { color: #10b981; }
        .status-error { color: #f43f5e; }
      </style>
      <script>
        const status = "${status}";
        const errorMsg = "${encodeURIComponent(message)}";
        
        if (window.opener) {
          window.opener.postMessage({
            type: "clospol:dropbox-connected",
            status: status,
            message: status === "error" ? decodeURIComponent(errorMsg) : ""
          }, "*");
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          setTimeout(() => {
            window.location.href = status === "success" 
              ? "/settings/drives?status=success" 
              : "/settings/drives?status=error&message=" + errorMsg;
          }, 2000);
        }
      </script>
    </head>
    <body>
      <div class="container">
        <h1 class="${status === "success" ? "status-success" : "status-error"}">
          ${status === "success" ? "Connection Successful" : "Connection Failed"}
        </h1>
        <p>${message}</p>
        <p style="font-size: 0.8rem; color: #64748b;">Closing window...</p>
      </div>
    </body>
    </html>
  `;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      return renderHtmlResponse("error", `Dropbox Auth Error: ${errorParam}`);
    }

    if (!code || !state) {
      return renderHtmlResponse("error", "Invalid authorization request. Missing code or state parameters.");
    }

    const statePayload = verifyToken(state);
    if (!statePayload || statePayload.action !== "connect") {
      return renderHtmlResponse("error", "Security check failed. The state parameter is invalid or has expired.");
    }

    const { userId, providerConfigId } = statePayload;

    const config = await prisma.providerConfig.findFirst({
      where: { id: providerConfigId, provider: "dropbox" },
    });

    if (!config) {
      return renderHtmlResponse("error", "OAuth Client configuration not found in settings.");
    }

    const clientId = decrypt(config.clientIdEncrypted);
    const clientSecret = decrypt(config.clientSecretEncrypted);

    // Exchange auth code for tokens
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return renderHtmlResponse("error", `Dropbox code exchange failed: ${tokenResponse.status} - ${errorText}`);
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token || !tokens.refresh_token) {
      return renderHtmlResponse("error", "Missing access or refresh tokens from Dropbox. Please check your credentials config.");
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : 14400 * 1000));

    // Fetch user details from Dropbox profile API
    const userProfileResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(null),
    });

    if (!userProfileResponse.ok) {
      const errorText = await userProfileResponse.text();
      return renderHtmlResponse("error", `Failed to retrieve user profile from Dropbox: ${userProfileResponse.status} - ${errorText}`);
    }

    const profileData = await userProfileResponse.json();
    const profileId = profileData.account_id || profileData.uid;

    if (!profileId || !profileData.email) {
      return renderHtmlResponse("error", "Unable to retrieve account identifiers from Dropbox.");
    }

    // Check if account already exists for user
    const existingAccount = await prisma.connectedAccount.findUnique({
      where: {
        userId_provider_providerAccountId: {
          userId,
          provider: "dropbox",
          providerAccountId: profileId,
        },
      },
    });

    let account;
    if (existingAccount) {
      account = await prisma.connectedAccount.update({
        where: { id: existingAccount.id },
        data: {
          email: profileData.email,
          displayName: profileData.name?.display_name || null,
          avatarUrl: profileData.profile_photo_url || null,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: expiresAt,
          scopes: JSON.stringify(tokens.scope ? tokens.scope.split(" ") : ["files.metadata.read", "files.content.write", "files.content.read"]),
          status: "connected",
          lastError: null,
        },
      });
    } else {
      account = await prisma.connectedAccount.create({
        data: {
          userId,
          providerConfigId: config.id,
          provider: "dropbox",
          providerAccountId: profileId,
          email: profileData.email,
          displayName: profileData.name?.display_name || null,
          avatarUrl: profileData.profile_photo_url || null,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: expiresAt,
          scopes: JSON.stringify(tokens.scope ? tokens.scope.split(" ") : ["files.metadata.read", "files.content.write", "files.content.read"]),
          status: "connected",
        },
      });
    }

    try {
      await DropboxService.syncDropboxQuota(account);
    } catch (syncErr: any) {
      console.warn("Dropbox quota sync failed on callback:", syncErr.message);
    }

    return renderHtmlResponse("success", `Dropbox Account (${profileData.email}) successfully integrated.`);

  } catch (err: any) {
    console.error("Dropbox OAuth callback error:", err);
    return renderHtmlResponse("error", err.message || "An unexpected error occurred during Dropbox integration.");
  }
}
