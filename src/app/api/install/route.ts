import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword, encrypt, generateSecureToken } from "@/lib/crypto";
import { writeEnv } from "@/lib/env-writer";
import { signToken } from "@/lib/jwt";
import { ActivityLogger } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json({ error: "Application is already installed." }, { status: 400 });
    }

    const body = await req.json();
    const { name, email, password, env = {}, localStorage: localData } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Administrator name, email, and password are required." }, { status: 400 });
    }

    // Set fallback defaults if keys are skipped or empty
    const envUpdates: Record<string, string> = {};
    envUpdates.APP_KEY = env.APP_KEY || generateSecureToken(32);
    envUpdates.JWT_ACCESS_SECRET = env.JWT_ACCESS_SECRET || generateSecureToken(32);
    envUpdates.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    envUpdates.GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || "";
    envUpdates.GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET || "";
    envUpdates.GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/oauth/google/callback";
    envUpdates.GOOGLE_DRIVE_ROOT_FOLDER = env.GOOGLE_DRIVE_ROOT_FOLDER || "clospol";
    envUpdates.S3_PREFIX = env.S3_PREFIX || "clospol";
    envUpdates.MAX_UPLOAD_BYTES = env.MAX_UPLOAD_BYTES || "5368709120"; // 5GB
    envUpdates.GITHUB_REPO = env.GITHUB_REPO || "aaafarrr/Clospol";
    envUpdates.RECAPTCHA_SECRET_KEY = env.RECAPTCHA_SECRET_KEY || "";
    envUpdates.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
    envUpdates.TZ = env.TZ || "Asia/Jakarta";
    envUpdates.NEXT_PUBLIC_FEATURE_CCTV = env.NEXT_PUBLIC_FEATURE_CCTV === undefined ? "true" : env.NEXT_PUBLIC_FEATURE_CCTV;
    envUpdates.NEXT_PUBLIC_FEATURE_WEBDAV = env.NEXT_PUBLIC_FEATURE_WEBDAV === undefined ? "true" : env.NEXT_PUBLIC_FEATURE_WEBDAV;
    envUpdates.NEXT_PUBLIC_FEATURE_INTEGRATIONS = env.NEXT_PUBLIC_FEATURE_INTEGRATIONS === undefined ? "true" : env.NEXT_PUBLIC_FEATURE_INTEGRATIONS;
    envUpdates.NEXT_PUBLIC_FEATURE_BACKUPS = env.NEXT_PUBLIC_FEATURE_BACKUPS === undefined ? "true" : env.NEXT_PUBLIC_FEATURE_BACKUPS;

    // Write updates to .env file
    writeEnv(envUpdates);

    // Create Admin User
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
      },
    });

    // Create Routing Policy
    await prisma.uploadRoutingPolicy.create({
      data: {
        userId: user.id,
        mode: "most_available",
        priorityAccountIds: "[]",
      },
    });

    // Get custom local storage params or fallbacks
    const localName = localData?.name?.trim() || "Local Server Storage";
    const localPath = localData?.serverPath?.trim() || "./storage/local";
    let localQuota = BigInt(50 * 1024 * 1024 * 1024); // 50 GB default
    if (localData?.quotaBytes) {
      try {
        localQuota = BigInt(localData.quotaBytes);
      } catch (_) {}
    }

    // Create Default Local Storage Account
    const connectedAccount = await prisma.connectedAccount.create({
      data: {
        userId: user.id,
        provider: "local",
        providerAccountId: "local-server",
        email: "local@server",
        displayName: localName,
        status: "connected",
        scopes: "[]",
      },
    });

    await prisma.localStorageConfig.create({
      data: {
        userId: user.id,
        connectedAccountId: connectedAccount.id,
        name: localName,
        serverPath: localPath,
      },
    });

    await prisma.storageAccount.create({
      data: {
        connectedAccountId: connectedAccount.id,
        totalBytes: localQuota,
        usedBytes: BigInt(0),
        availableBytes: localQuota,
      },
    });

    // Create Google Provider Configuration in DB if credentials provided
    if (envUpdates.GOOGLE_CLIENT_ID && envUpdates.GOOGLE_CLIENT_SECRET) {
      await prisma.providerConfig.create({
        data: {
          userId: user.id,
          provider: "google_drive",
          clientIdEncrypted: encrypt(envUpdates.GOOGLE_CLIENT_ID),
          clientSecretEncrypted: encrypt(envUpdates.GOOGLE_CLIENT_SECRET),
          redirectUri: envUpdates.GOOGLE_REDIRECT_URI,
          scopes: JSON.stringify([
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile"
          ]),
          status: "active",
        },
      });
    }

    // Set cookie and login
    const token = signToken({ userId: user.id });
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });

    response.cookies.set({
      name: "clospol_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    await ActivityLogger.log("install", "user", user.id, { name: user.name, email: user.email }, user.id);

    return response;
  } catch (err: any) {
    console.error("Installation error:", err);
    return NextResponse.json({ error: err.message || "Failed to initialize application." }, { status: 500 });
  }
}
