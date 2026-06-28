import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all connected accounts for the user
    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId: user.id,
        status: "connected",
      },
    });

    const results: any[] = [];

    for (const account of accounts) {
      try {
        let result;
        const { StorageCoordinator } = await import("@/services/storage/coordinator");
        if (account.provider === "local") {
          result = await LocalStorageService.syncLocalFiles(account.id, user.id);
        } else if (account.provider === "s3") {
          result = await S3StorageService.syncS3Files(account.id, user.id);
        } else {
          result = await StorageCoordinator.syncAccountFiles(account.id, user.id, account.provider);
        }

        if (result) {
          results.push({
            provider: account.provider,
            displayName: account.displayName || account.email,
            ...result,
          });
        }
      } catch (err: any) {
        console.error(`Error syncing files for account ${account.id} (${account.provider}):`, err);
        results.push({
          provider: account.provider,
          displayName: account.displayName || account.email,
          error: err.message || "Failed to sync",
        });
      }
    }

    return NextResponse.json({
      message: "Sync completed successfully.",
      results,
    });
  } catch (err: any) {
    console.error("Storage sync API error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
