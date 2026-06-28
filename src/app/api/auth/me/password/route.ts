import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { ActivityLogger } from "@/lib/audit";

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters long" }, { status: 400 });
    }

    // If password is set on the user, check old password
    if (user.passwordHash) {
      if (!oldPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }

      const isMatch = await verifyPassword(oldPassword, user.passwordHash);
      if (!isMatch) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    await ActivityLogger.log("change_password", "user", user.id, null, user.id);

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (err: any) {
    console.error("PUT password error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
