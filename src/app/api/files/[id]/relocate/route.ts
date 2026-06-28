import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:upload")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:upload' is required" }, { status: 403 });
      }
    }

    const { id: fileId } = await params;
    const body = await req.json();
    const { targetAccountId } = body;

    if (!targetAccountId) {
      return NextResponse.json({ error: "targetAccountId is required" }, { status: 400 });
    }

    // 1. Fetch file record from DB
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId: user.id, status: "active" },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.connectedAccountId === targetAccountId) {
      return NextResponse.json({ message: "File is already located on this storage account." });
    }

    // 2. Fetch destination connected account
    const targetAccount = await prisma.connectedAccount.findFirst({
      where: { id: targetAccountId, userId: user.id, status: "connected" },
    });

    if (!targetAccount) {
      return NextResponse.json({ error: "Target storage account not found or disconnected" }, { status: 404 });
    }

    // 3. Open a readable stream from source provider
    let sourceStream: Readable;
    try {
      if (file.provider === "local") {
        sourceStream = LocalStorageService.streamLocalFile(file);
      } else if (file.provider === "s3") {
        sourceStream = await S3StorageService.streamS3File(file);
      } else if (file.provider === "google_drive") {
        sourceStream = await GoogleDriveService.streamGoogleFile(file);
      } else {
        return NextResponse.json({ error: `Unsupported source provider: ${file.provider}` }, { status: 400 });
      }
    } catch (streamErr: any) {
      return NextResponse.json({ error: `Failed to open stream from source storage: ${streamErr.message}` }, { status: 500 });
    }

    // 4. Upload the stream to destination provider
    let newProviderFileId = "";
    try {
      if (targetAccount.provider === "local") {
        const targetConfig = await LocalStorageService.getLocalConfigForAccount(targetAccountId, user.id);
        newProviderFileId = LocalStorageService.buildLocalFileId(targetConfig, user.id, file.id, file.name);
        await LocalStorageService.uploadLocalFile(targetConfig, newProviderFileId, sourceStream);
        await LocalStorageService.syncLocalQuota(targetAccountId);

      } else if (targetAccount.provider === "s3") {
        const targetConfig = await S3StorageService.getS3ConfigForAccount(targetAccountId, user.id);
        newProviderFileId = S3StorageService.buildS3ObjectKey(targetConfig, user.id, file.id, file.name);
        await S3StorageService.uploadS3Object(targetConfig, newProviderFileId, sourceStream, file.mimeType);
        await S3StorageService.syncS3Quota(targetAccountId);

      } else if (targetAccount.provider === "google_drive") {
        newProviderFileId = await GoogleDriveService.uploadGoogleFile(
          targetAccount,
          file.name,
          sourceStream,
          file.mimeType
        );
        await GoogleDriveService.syncGoogleQuota(targetAccount);
      } else {
        return NextResponse.json({ error: `Unsupported target provider: ${targetAccount.provider}` }, { status: 400 });
      }
    } catch (uploadErr: any) {
      return NextResponse.json({ error: `Relocation upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    // 5. Delete source file physically
    try {
      if (file.provider === "local") {
        await LocalStorageService.deleteLocalFile(file);
      } else if (file.provider === "s3") {
        await S3StorageService.deleteS3Object(file);
      } else if (file.provider === "google_drive") {
        await GoogleDriveService.deleteGoogleFile(file);
      }
    } catch (delErr: any) {
      console.warn(`[Relocation] Failed to clean up old physical copy: ${delErr.message}`);
    }

    // 6. Update database record in-place
    const updatedFile = await prisma.file.update({
      where: { id: file.id },
      data: {
        connectedAccountId: targetAccountId,
        provider: targetAccount.provider,
        providerFileId: newProviderFileId,
      },
    });

    // 7. Sync old storage quota in background
    try {
      if (file.provider === "local") {
        await LocalStorageService.syncLocalQuota(file.connectedAccountId);
      } else if (file.provider === "s3") {
        await S3StorageService.syncS3Quota(file.connectedAccountId);
      } else if (file.provider === "google_drive") {
        const oldAccount = await prisma.connectedAccount.findUnique({
          where: { id: file.connectedAccountId },
        });
        if (oldAccount) {
          await GoogleDriveService.syncGoogleQuota(oldAccount);
        }
      }
    } catch (syncErr: any) {
      console.warn(`[Relocation] Failed to sync source storage quota: ${syncErr.message}`);
    }

    // 8. Log the relocation action
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "relocate",
        entityType: "file",
        entityId: file.id,
        metadata: JSON.stringify({
          name: file.name,
          fromProvider: file.provider,
          toProvider: targetAccount.provider,
        }),
      },
    });

    return NextResponse.json({
      message: `File "${file.name}" relocated successfully to ${targetAccount.displayName || targetAccount.provider}.`,
      file: {
        ...updatedFile,
        sizeBytes: updatedFile.sizeBytes.toString(),
      },
    });

  } catch (err: any) {
    console.error("Relocation error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
