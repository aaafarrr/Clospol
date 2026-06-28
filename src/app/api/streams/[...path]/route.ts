import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

/**
 * GET: Serves dynamic HLS playlist files and video segment files.
 * This bypasses Next.js dev/prod static file system caching.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    if (!pathSegments || pathSegments.length < 2) {
      return NextResponse.json({ error: "Invalid stream request path" }, { status: 400 });
    }

    const diskPath = path.join(process.cwd(), "public", "streams", ...pathSegments);
    const isM3u8 = diskPath.endsWith(".m3u8");

    // Polling fallback: if the playlist doesn't exist yet, wait up to 6 seconds for FFmpeg to write it
    if (isM3u8 && !fs.existsSync(diskPath)) {
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (fs.existsSync(diskPath)) {
          break;
        }
      }
    }

    if (!fs.existsSync(diskPath)) {
      return new NextResponse("Stream File Not Found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(diskPath);
    const contentType = isM3u8 ? "application/vnd.apple.mpegurl" : "video/mp2t";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.error("[CCTV Stream Serv API Error]:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
