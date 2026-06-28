import { NextRequest } from "next/server";
import prisma from "./db";
import { hashPassword } from "./crypto";
import { verifyToken } from "./jwt";

/**
 * Get or seed the default primary administrator user.
 */
export async function getOrCreateDefaultUser() {
  let user = await prisma.user.findFirst();
  if (!user) {
    const passwordHash = await hashPassword("admin");
    user = await prisma.user.create({
      data: {
        email: "admin@clospol.local",
        name: "Administrator",
        passwordHash,
      },
    });

    // Seed default upload routing policy
    await prisma.uploadRoutingPolicy.create({
      data: {
        userId: user.id,
        mode: "most_available",
        priorityAccountIds: "[]",
      },
    });

    // Seed a default connected local storage account so there is a working storage out-of-the-box
    const connectedAccount = await prisma.connectedAccount.create({
      data: {
        userId: user.id,
        provider: "local",
        providerAccountId: "local-server",
        email: "local@server",
        displayName: "Local Server Storage",
        status: "connected",
        scopes: "[]",
      },
    });

    await prisma.localStorageConfig.create({
      data: {
        userId: user.id,
        connectedAccountId: connectedAccount.id,
        name: "Local Storage",
        serverPath: "./storage/local",
      },
    });

    await prisma.storageAccount.create({
      data: {
        connectedAccountId: connectedAccount.id,
        totalBytes: BigInt(50 * 1024 * 1024 * 1024), // 50 GB mock
        usedBytes: BigInt(0),
        availableBytes: BigInt(50 * 1024 * 1024 * 1024),
      },
    });
  }
  return user;
}

/**
 * Resolve the authenticated user context for API Route Handlers.
 */
export async function getAuthenticatedUser(req?: NextRequest): Promise<any> {
  if (!req) {
    // If no request context is provided, return default admin
    const defaultUser = await prisma.user.findFirst();
    return defaultUser;
  }

  // 1. Check for cookie session (UI dashboard login)
  const tokenCookie = req.cookies.get("clospol_token")?.value;
  if (tokenCookie) {
    const decoded = verifyToken(tokenCookie);
    if (decoded && decoded.userId) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (user) {
        return user;
      }
    }
  }

  // 2. Check for Authorization header (Bearer API key token)
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const secret = authHeader.substring(7); // Extract token part
    if (secret.startsWith("9d_live_")) {
      const { hashToken } = await import("./crypto");
      const keyHash = hashToken(secret);

      const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { user: true },
      });

      if (apiKey && apiKey.status === "active") {
        // Validate expiration
        if (!apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date()) {
          // Update lastUsedAt asynchronously
          prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { lastUsedAt: new Date() },
          }).catch((err) => console.error("Failed to update lastUsedAt:", err));

          let scopesArr = ["files:upload"];
          if (apiKey.scopes) {
            try {
              scopesArr = JSON.parse(apiKey.scopes);
            } catch (e) {}
          }

          // Return user object with attached key details
          return {
            ...apiKey.user,
            _apiKey: {
              id: apiKey.id,
              name: apiKey.name,
              scopes: scopesArr,
            },
          };
        }
      }
    }
  }

  return null;
}
