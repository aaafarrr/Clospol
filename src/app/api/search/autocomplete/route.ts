import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = req.nextUrl.searchParams.get("q") || "";
    if (!q.trim()) {
      return NextResponse.json({ folders: [], files: [] });
    }

    const folders = await prisma.folder.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        name: {
          contains: q,
        },
      },
      take: 5,
      select: {
        id: true,
        name: true,
        color: true,
        iconUrl: true,
      },
    });

    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        status: "active",
        name: {
          contains: q,
        },
      },
      take: 5,
      select: {
        id: true,
        name: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    return NextResponse.json({
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        iconUrl: folder.iconUrl,
      })),
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes.toString(),
      })),
    });
  } catch (err: any) {
    console.error("GET autocomplete error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
