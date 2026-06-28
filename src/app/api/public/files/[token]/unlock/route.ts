import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashToken, verifyPassword } from "@/lib/crypto";
import { signToken } from "@/lib/jwt";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const share = await prisma.fileShare.findFirst({
      where: { tokenHash, enabled: true },
    });

    if (!share) {
      return NextResponse.json({ error: "Share link not found or disabled" }, { status: 404 });
    }

    if (!share.passwordHash) {
      return NextResponse.json({ message: "No password protection configured for this share." });
    }

    const isMatch = await verifyPassword(password, share.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Sign verification token (1 day expiry)
    const verificationToken = signToken({ shareId: share.id }, 86400);

    const response = NextResponse.json({ status: "unlocked" });

    // Set cookie
    response.cookies.set(`unlocked_share_${share.id}`, verificationToken, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 86400,
      sameSite: "lax",
    });

    return response;

  } catch (err: any) {
    console.error("Public share unlock error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
