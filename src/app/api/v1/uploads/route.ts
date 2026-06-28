import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { StorageUploaderService } from "@/services/storage/uploader";
import { UploadRoutingService } from "@/services/storage/routing";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate API Key Scopes if authenticated via API token
    if (user._apiKey) {
      const scopes: string[] = user._apiKey.scopes || [];
      if (!scopes.includes("files:upload")) {
        return NextResponse.json({ error: "Forbidden: scope 'files:upload' is required" }, { status: 403 });
      }
    }

    // 3. Parse Multipart Form Data
    const formData = await req.formData();
    let file: any = null;
    let fileName = "";
    let fileType = "";
    const folderId = formData.get("folderId") as string | null;

    // Check filesMeta (documented JS integration format)
    const filesMetaStr = formData.get("filesMeta") as string | null;
    if (filesMetaStr) {
      try {
        const meta = JSON.parse(filesMetaStr);
        if (Array.isArray(meta) && meta.length > 0) {
          const fieldName = meta[0].fieldName;
          file = formData.get(fieldName) as any;
          if (file) {
            fileName = meta[0].fileName || file.name;
            fileType = meta[0].mimeType || file.type;
          }
        }
      } catch (err) {
        console.error("Failed to parse filesMeta:", err);
      }
    }

    // Fallback to standard "file" field
    if (!file) {
      file = formData.get("file") as any;
      if (file) {
        fileName = file.name;
        fileType = file.type;
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file uploaded in the request" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const size = buffer.length;
    const stream = Readable.from(buffer);

    // 4. Resolve storage account destination using upload policy
    const storageAccount = await UploadRoutingService.selectRoutingAccount(user.id, size);
    if (!storageAccount) {
      return NextResponse.json({ error: "No active storage account resolved." }, { status: 507 });
    }

    // 5. Upload file via storage uploader service
    const savedFile = await StorageUploaderService.uploadAndSaveFile(
      user.id,
      storageAccount,
      fileName,
      fileType || "application/octet-stream",
      size,
      folderId === "" || folderId === "null" ? null : folderId,
      stream,
      user._apiKey ? { id: user._apiKey.id, name: user._apiKey.name } : undefined
    );

    return NextResponse.json({
      success: true,
      message: "File uploaded successfully",
      file: {
        ...savedFile,
        sizeBytes: savedFile.sizeBytes.toString(),
      }
    }, { status: 201 });

  } catch (err: any) {
    console.error("POST v1 uploads error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
