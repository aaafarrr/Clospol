import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groups = await prisma.file.groupBy({
      by: ["mimeType"],
      where: {
        userId: user.id,
        status: "active",
        deletedAt: null,
      },
      _sum: {
        sizeBytes: true,
      },
    });

    let photo = 0n;
    let video = 0n;
    let document = 0n;

    for (const group of groups) {
      const mime = group.mimeType || "";
      const sum = group._sum.sizeBytes;
      const size = sum ? BigInt(sum.toString()) : 0n;

      if (mime.startsWith("image/")) {
        photo += size;
      } else if (mime.startsWith("video/")) {
        video += size;
      } else {
        document += size;
      }
    }

    return NextResponse.json({
      photo: photo.toString(),
      video: video.toString(),
      document: document.toString(),
    });
  } catch (err: any) {
    console.error("GET storage breakdown error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
