import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { signToken } from "@/lib/jwt";
import { ActivityLogger } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const totalUsers = await prisma.user.count();
    if (totalUsers > 0) {
      return NextResponse.json({ error: "Registration is disabled. Only 1 administrator account is allowed." }, { status: 403 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
      }
    });

    // Seed default policy & connected local storage on registration of first user
    const finalUserCount = await prisma.user.count();
    if (finalUserCount === 1) {
      await prisma.uploadRoutingPolicy.create({
        data: {
          userId: user.id,
          mode: "most_available",
          priorityAccountIds: "[]",
        },
      });

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
          totalBytes: BigInt(50 * 1024 * 1024 * 1024),
          usedBytes: BigInt(0),
          availableBytes: BigInt(50 * 1024 * 1024 * 1024),
        },
      });
    }

    const token = signToken({ userId: user.id });

    // Set cookie
    const response = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      token
    }, { status: 201 });

    response.cookies.set({
      name: "clospol_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/"
    });

    await ActivityLogger.log("register", "user", user.id, { name: user.name, email: user.email }, user.id);

    return response;
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
