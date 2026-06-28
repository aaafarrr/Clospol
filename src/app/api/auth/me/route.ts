import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { ActivityLogger } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        password_set: !!user.passwordHash,
      }
    });
  } catch (err: any) {
    console.error("GET profile error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, email } = await req.json();

    if (!name && !email) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      if (normalizedEmail !== user.email) {
        // Check if taken
        const existing = await prisma.user.findUnique({
          where: { email: normalizedEmail }
        });
        if (existing) {
          return NextResponse.json({ error: "Email is already taken" }, { status: 409 });
        }
        updateData.email = normalizedEmail;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData
    });

    await ActivityLogger.log("update_profile", "user", user.id, { name: updatedUser.name, email: updatedUser.email }, user.id);

    return NextResponse.json({
      message: "Profile updated successfully.",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        password_set: !!updatedUser.passwordHash,
      }
    });
  } catch (err: any) {
    console.error("PUT profile error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
