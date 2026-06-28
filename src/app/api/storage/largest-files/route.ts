import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    const files = await prisma.file.findMany({
      where: {
        userId: user.id,
        status: "active",
        deletedAt: null,
      },
      orderBy: {
        sizeBytes: "desc",
      },
      take: 10,
    });

    const formattedFiles = files.map((file) => ({
      id: file.id,
      name: file.name,
      sizeBytes: file.sizeBytes.toString(),
      provider: file.provider,
      createdAt: file.createdAt.toISOString(),
    }));

    return NextResponse.json({ files: formattedFiles });
  } catch (err: any) {
    console.error("GET largest files error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
