import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";
import { LocalStorageService } from "@/services/storage/local";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { google } from "googleapis";

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

    const { id } = await params;

    const file = await prisma.file.findFirst({
      where: { id, userId: user.id, status: "active" },
      include: { connectedAccount: true }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Determine the copy name
    const originalName = file.name;
    const extensionIndex = originalName.lastIndexOf(".");
    let newName = "";
    if (extensionIndex === -1) {
      newName = `${originalName} - Copy`;
    } else {
      newName = `${originalName.substring(0, extensionIndex)} - Copy${originalName.substring(extensionIndex)}`;
    }

    const newFileId = crypto.randomUUID();
    let newProviderFileId = "";

    // Copy physically on the storage provider
    if (file.provider === "local") {
      const config = await LocalStorageService.getLocalConfigForAccount(file.connectedAccountId);
      const sourcePath = path.resolve(file.providerFileId);
      const destPath = LocalStorageService.buildLocalFileId(config, file.userId, newFileId, newName);
      const parentDir = path.dirname(destPath);

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true, mode: 0o755 });
      }

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
      } else {
        return NextResponse.json({ error: "Source file not found on local disk" }, { status: 404 });
      }
      newProviderFileId = destPath;

    } else if (file.provider === "s3") {
      const config = await S3StorageService.getS3ConfigForAccount(file.connectedAccountId);
      const client = S3StorageService.createS3Client(config);
      const newKey = S3StorageService.buildS3ObjectKey(config, file.userId, newFileId, newName);

      await client.send(
        new CopyObjectCommand({
          Bucket: config.bucket,
          CopySource: encodeURIComponent(`${config.bucket}/${file.providerFileId}`),
          Key: newKey,
        })
      );
      newProviderFileId = newKey;

    } else if (file.provider === "google_drive") {
      const account = file.connectedAccount;
      if (!account) {
        return NextResponse.json({ error: "Storage account not found for file" }, { status: 404 });
      }
      const auth = await GoogleDriveService.getAuthedGoogleClient(account);
      const drive = google.drive({ version: "v3", auth });

      const response = await drive.files.copy({
        fileId: file.providerFileId,
        requestBody: {
          name: newName,
        },
        fields: "id",
      });

      if (!response.data.id) {
        throw new Error("Google Drive copy request failed.");
      }
      newProviderFileId = response.data.id;
    } else {
      return NextResponse.json({ error: "Unsupported storage provider" }, { status: 400 });
    }

    // Save copy in the database
    const copyFile = await prisma.file.create({
      data: {
        id: newFileId,
        userId: file.userId,
        connectedAccountId: file.connectedAccountId,
        folderId: file.folderId,
        provider: file.provider,
        providerFileId: newProviderFileId,
        name: newName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        status: "active",
        isStarred: false,
      }
    });

    return NextResponse.json({
      file: {
        ...copyFile,
        sizeBytes: copyFile.sizeBytes.toString()
      }
    });
  } catch (err: any) {
    console.error("Copy file API error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
