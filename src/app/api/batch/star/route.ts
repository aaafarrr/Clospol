import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { fileIds = [], folderIds = [], star = true } = await req.json();

    if (fileIds.length === 0 && folderIds.length === 0) {
      return NextResponse.json({ error: "No items specified" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.file.updateMany({
        where: {
          userId: user.id,
          id: { in: fileIds }
        },
        data: {
          isStarred: star
        }
      }),
      prisma.folder.updateMany({
        where: {
          userId: user.id,
          id: { in: folderIds }
        },
        data: {
          isStarred: star
        }
      })
    ]);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Batch star error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
