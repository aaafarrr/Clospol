import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { LocalStorageService } from "@/services/storage/local";
import { S3StorageService } from "@/services/storage/s3";
import { GoogleDriveService } from "@/services/storage/google";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenHash = hashToken(token);

    const previewToken = await prisma.filePreviewToken.findFirst({
      where: { tokenHash },
      include: { file: true },
    });

    if (!previewToken) {
      return new NextResponse("Preview token not found or expired", { status: 404 });
    }

    if (previewToken.expiresAt < new Date()) {
      return new NextResponse("Preview token has expired", { status: 403 });
    }

    const { file } = previewToken;

    // Check Range header for media players (video seeking)
    const range = req.headers.get("range") || undefined;

    let sourceStream: Readable;
    if (file.provider === "local") {
      sourceStream = LocalStorageService.streamLocalFile(file);
    } else if (file.provider === "s3") {
      sourceStream = await S3StorageService.streamS3File(file, range);
    } else if (file.provider === "google_drive") {
      sourceStream = await GoogleDriveService.streamGoogleFile(file);
    } else {
      return new NextResponse("Unsupported file provider", { status: 400 });
    }

    const webStream = Readable.toWeb(sourceStream);

    return new NextResponse(webStream as any, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": file.sizeBytes.toString(),
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
        "Accept-Ranges": "bytes",
        ...(range && { "Content-Range": range }),
      },
    });

  } catch (err: any) {
    console.error("Preview token streaming error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
