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

    const folder = await prisma.folder.findFirst({
      where: { id, userId: user.id, deletedAt: null }
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // Disable existing folder shares
    await prisma.fileShare.updateMany({
      where: { folderId: folder.id, userId: user.id, enabled: true },
      data: { enabled: false }
    });

    const token = generateSecureToken(16); // 32-char hex string
    const tokenHash = hashToken(token);
    const passwordHash = password ? await hashPassword(password) : null;
    const expiresAtDate = expiresAt ? new Date(expiresAt) : null;
    const maxDownloadsNum = maxDownloads ? parseInt(maxDownloads) : null;

    const share = await prisma.fileShare.create({
      data: {
        folderId: folder.id,
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

    await ActivityLogger.log("share_link", "folder", folder.id, { name: folder.name }, user.id);

    return NextResponse.json({
      url: `${appUrl}/public/files/${token}`,
      shareId: share.id
    }, { status: 201 });
  } catch (err: any) {
    console.error("Create folder share link error:", err);
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
      where: { folderId: id, userId: user.id, enabled: true },
      data: { enabled: false }
    });

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Disable folder share link error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
