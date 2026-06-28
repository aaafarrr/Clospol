import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { GoogleDriveService } from "@/services/storage/google";
import { verifyToken } from "@/lib/jwt";
import { encrypt } from "@/lib/crypto";
import { google } from "googleapis";

function renderHtmlResponse(status: "success" | "error", message: string) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Google Drive Integration</title>
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
            type: "clospol:google-connected",
            status: status,
            message: status === "error" ? decodeURIComponent(errorMsg) : ""
          }, "*");
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          setTimeout(() => {
            window.location.href = status === "success" 
              ? "/dashboard?status=success" 
              : "/dashboard?status=error&message=" + errorMsg;
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
      return renderHtmlResponse("error", `Google Auth Error: ${errorParam}`);
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
      where: { id: providerConfigId, provider: "google_drive" },
    });

    if (!config) {
      return renderHtmlResponse("error", "OAuth Client configuration not found in settings.");
    }

    const client = await GoogleDriveService.createOAuthClient(config);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Fetch user details from Google profile API
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfoRes = await oauth2.userinfo.get();
    const userInfo = userInfoRes.data;

    if (!userInfo.id || !userInfo.email) {
      return renderHtmlResponse("error", "Unable to retrieve account identifiers from Google.");
    }

    // Check if account already exists for user
    const existingAccount = await prisma.connectedAccount.findUnique({
      where: {
        userId_provider_providerAccountId: {
          userId,
          provider: "google_drive",
          providerAccountId: userInfo.id,
        },
      },
    });

    let account;
    if (existingAccount) {
      // Update existing connection with fresh tokens
      account = await prisma.connectedAccount.update({
        where: { id: existingAccount.id },
        data: {
          email: userInfo.email,
          displayName: userInfo.name || null,
          avatarUrl: userInfo.picture || null,
          accessTokenEncrypted: tokens.access_token ? encrypt(tokens.access_token) : undefined,
          // Preserve old refresh token if Google didn't issue a new one
          refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          scopes: tokens.scope ? JSON.stringify(tokens.scope.split(" ")) : undefined,
          status: "connected",
          lastError: null,
        },
      });
    } else {
      if (!tokens.access_token || !tokens.refresh_token) {
        return renderHtmlResponse("error", "Missing access/refresh tokens. Please revoke application access and reconnect.");
      }
      account = await prisma.connectedAccount.create({
        data: {
          userId,
          providerConfigId: config.id,
          provider: "google_drive",
          providerAccountId: userInfo.id,
          email: userInfo.email,
          displayName: userInfo.name || null,
          avatarUrl: userInfo.picture || null,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: JSON.stringify(tokens.scope ? tokens.scope.split(" ") : []),
          status: "connected",
        },
      });
    }

    // Attempt to run an initial storage quota sync
    try {
      await GoogleDriveService.syncGoogleQuota(account);
    } catch (syncErr: any) {
      console.warn("Quota sync failed on callback (tolerable):", syncErr.message);
    }

    return renderHtmlResponse("success", `Google Account (${userInfo.email}) successfully integrated.`);

  } catch (err: any) {
    console.error("Google OAuth callback error:", err);
    return renderHtmlResponse("error", err.message || "An unexpected error occurred during integration.");
  }
}
