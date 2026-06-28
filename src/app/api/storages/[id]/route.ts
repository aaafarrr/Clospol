import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const account = await prisma.connectedAccount.findFirst({
      where: { id, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Connected account not found" }, { status: 404 });
    }

    let localStorageConfig: any = null;
    if (account.provider === "local") {
      localStorageConfig = await prisma.localStorageConfig.findFirst({
        where: { connectedAccountId: account.id },
      });
    }

    return NextResponse.json({
      account: {
        id: account.id,
        provider: account.provider,
        displayName: account.displayName,
        email: account.email,
        localStorageConfig: localStorageConfig ? {
          serverPath: localStorageConfig.serverPath,
          quotaBytes: localStorageConfig.quotaBytes !== null ? localStorageConfig.quotaBytes.toString() : null,
        } : null,
      },
    });
  } catch (err: any) {
    console.error("GET connected account error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { name, path: dirPath, quotaBytes } = body;

    const account = await prisma.connectedAccount.findFirst({
      where: { id, userId: user.id, provider: "local" },
    });

    if (!account) {
      return NextResponse.json({ error: "Connected account not found or is not local storage" }, { status: 404 });
    }

    if (!name || !dirPath) {
      return NextResponse.json({ error: "Name and Directory Path are required" }, { status: 400 });
    }

    // Test local connection first
    try {
      await LocalStorageService.testLocalConnection(dirPath);
    } catch (testErr: any) {
      return NextResponse.json({ code: "LOCAL_CONNECTION_FAILED", message: testErr.message }, { status: 400 });
    }

    const parsedQuotaBytes = quotaBytes ? BigInt(quotaBytes) : null;
    const pathBasename = path.basename(dirPath);

    const updatedAccount = await prisma.connectedAccount.update({
      where: { id: account.id },
      data: {
        displayName: name,
        email: `Local Storage (${pathBasename})`,
        providerAccountId: `local:${require("crypto").createHash("md5").update(dirPath).digest("hex")}`,
      },
    });

    await prisma.localStorageConfig.updateMany({
      where: { connectedAccountId: account.id },
      data: {
        name,
        serverPath: dirPath,
        quotaBytes: parsedQuotaBytes,
      },
    });

    // Sync quota
    const quota = await LocalStorageService.syncLocalQuota(account.id);

    return NextResponse.json({
      message: "Local storage configuration updated successfully.",
      account: {
        ...updatedAccount,
        storageAccount: {
          id: quota.id,
          connected_account_id: quota.connectedAccountId,
          totalBytes: quota.totalBytes !== null ? quota.totalBytes.toString() : null,
          usedBytes: quota.usedBytes.toString(),
          availableBytes: quota.availableBytes !== null ? quota.availableBytes.toString() : null,
          trashBytes: quota.trashBytes !== null ? quota.trashBytes.toString() : null,
          lastSyncedAt: quota.lastSyncedAt ? quota.lastSyncedAt.toISOString() : null,
        },
      },
    });

  } catch (err: any) {
    console.error("Update local storage config error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
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

    const account = await prisma.connectedAccount.findFirst({
      where: { id, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Connected account not found" }, { status: 404 });
    }

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: "disconnected" },
    });

    return NextResponse.json({ status: "ok" });

  } catch (err: any) {
    console.error("Disconnect account error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
