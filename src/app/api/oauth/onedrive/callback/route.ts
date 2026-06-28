import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { OneDriveService } from "@/services/storage/onedrive";
import { verifyToken } from "@/lib/jwt";
import { encrypt, decrypt } from "@/lib/crypto";

function renderHtmlResponse(status: "success" | "error", message: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>OneDrive Integration</title>
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
            type: "clospol:onedrive-connected",
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
      return renderHtmlResponse("error", `OneDrive Auth Error: ${errorParam}`);
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
      where: { id: providerConfigId, provider: "onedrive" },
    });

    if (!config) {
      return renderHtmlResponse("error", "OAuth Client configuration not found in settings.");
    }

    const clientId = decrypt(config.clientIdEncrypted);
    const clientSecret = decrypt(config.clientSecretEncrypted);

    // Exchange auth code for Microsoft Graph tokens
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
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
      return renderHtmlResponse("error", `OneDrive token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token || !tokens.refresh_token) {
      return renderHtmlResponse("error", "Missing access or refresh tokens from OneDrive. Please check your credentials config.");
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : 3600 * 1000));

    // Fetch user profile from Microsoft Graph me endpoint
    const userProfileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
      },
    });

    if (!userProfileResponse.ok) {
      const errorText = await userProfileResponse.text();
      return renderHtmlResponse("error", `Failed to retrieve user profile from Microsoft Graph: ${userProfileResponse.status} - ${errorText}`);
    }

    const profileData = await userProfileResponse.json();
    const profileId = profileData.id;
    const email = profileData.userPrincipalName || profileData.mail;

    if (!profileId || !email) {
      return renderHtmlResponse("error", "Unable to retrieve account identifiers from OneDrive.");
    }

    // Check if account already exists for user
    const existingAccount = await prisma.connectedAccount.findUnique({
      where: {
        userId_provider_providerAccountId: {
          userId,
          provider: "onedrive",
          providerAccountId: profileId,
        },
      },
    });

    let account;
    if (existingAccount) {
      account = await prisma.connectedAccount.update({
        where: { id: existingAccount.id },
        data: {
          email: email,
          displayName: profileData.displayName || null,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: expiresAt,
          scopes: JSON.stringify(tokens.scope ? tokens.scope.split(" ") : ["files.readwrite", "offline_access"]),
          status: "connected",
          lastError: null,
        },
      });
    } else {
      account = await prisma.connectedAccount.create({
        data: {
          userId,
          providerConfigId: config.id,
          provider: "onedrive",
          providerAccountId: profileId,
          email: email,
          displayName: profileData.displayName || null,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: expiresAt,
          scopes: JSON.stringify(tokens.scope ? tokens.scope.split(" ") : ["files.readwrite", "offline_access"]),
          status: "connected",
        },
      });
    }

    try {
      await OneDriveService.syncOneDriveQuota(account);
    } catch (syncErr: any) {
      console.warn("OneDrive quota sync failed on callback:", syncErr.message);
    }

    return renderHtmlResponse("success", `OneDrive Account (${email}) successfully integrated.`);

  } catch (err: any) {
    console.error("OneDrive OAuth callback error:", err);
    return renderHtmlResponse("error", err.message || "An unexpected error occurred during OneDrive integration.");
  }
}
