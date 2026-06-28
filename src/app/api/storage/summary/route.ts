import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    const connectedAccounts = await prisma.connectedAccount.findMany({
      where: {
        userId: user.id,
        status: "connected",
      },
      include: {
        storageAccount: true,
      },
    });

    let totalBytes = 0n;
    let usedBytes = 0n;
    let availableBytes = 0n;

    const accounts = connectedAccounts.map((acc) => {
      const storage = acc.storageAccount;
      if (storage) {
        totalBytes += BigInt(storage.totalBytes ? storage.totalBytes.toString() : "0");
        usedBytes += BigInt(storage.usedBytes ? storage.usedBytes.toString() : "0");
        availableBytes += BigInt(storage.availableBytes ? storage.availableBytes.toString() : "0");
      }

      return {
        id: acc.id,
        provider: acc.provider,
        displayName: acc.displayName || acc.provider,
        email: acc.email,
        totalBytes: storage?.totalBytes ? storage.totalBytes.toString() : null,
        usedBytes: storage?.usedBytes ? storage.usedBytes.toString() : "0",
        availableBytes: storage?.availableBytes ? storage.availableBytes.toString() : null,
        trashBytes: storage?.trashBytes ? storage.trashBytes.toString() : null,
        lastSyncedAt: storage?.lastSyncedAt ? storage.lastSyncedAt.toISOString() : null,
      };
    });

    return NextResponse.json({
      totalBytes: totalBytes.toString(),
      usedBytes: usedBytes.toString(),
      availableBytes: availableBytes.toString(),
      accounts,
    });
  } catch (err: any) {
    console.error("GET storage summary error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

