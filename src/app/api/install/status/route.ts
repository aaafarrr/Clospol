import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({ installed: userCount > 0 });
  } catch (err: any) {
    console.error("GET install status error:", err);
    return NextResponse.json({ error: "Database connection failed" }, { status: 500 });
  }
}
