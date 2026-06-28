import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { generateSecureToken, hashToken, hashPassword } from "@/lib/crypto";
import { ActivityLogger } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { password, expiresAt, maxDownloads } = body;

    const file = await prisma.file.findFirst({
      where: { id, userId: user.id, status: "active" }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Disable existing shares
    await prisma.fileShare.updateMany({
      where: { fileId: file.id, userId: user.id, enabled: true },
      data: { enabled: false }
    });

    const token = generateSecureToken(16); // 32-char hex string
    const tokenHash = hashToken(token);
    const passwordHash = password ? await hashPassword(password) : null;
    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
    const maxDownloadsNum = maxDownloads ? parseInt(maxDownloads) : null;

    const share = await prisma.fileShare.create({
      data: {
        fileId: file.id,
        userId: user.id,
        token,
        tokenHash,
        passwordHash,
        expiresAt: expiresAtDate,
        maxDownloads: maxDownloadsNum,
        enabled: true
      }
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    await ActivityLogger.log("share_link", "file", file.id, { name: file.name }, user.id);

    return NextResponse.json({
      url: `${appUrl}/public/files/${token}`,
      shareId: share.id
    }, { status: 201 });
  } catch (err: any) {
    console.error("Create share link error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    await prisma.fileShare.updateMany({
      where: { fileId: id, userId: user.id, enabled: true },
      data: { enabled: false }
    });

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Disable share link error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
