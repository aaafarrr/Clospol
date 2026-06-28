import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);

    const accounts = await prisma.connectedAccount.findMany({
      where: {
        userId: user.id,
        status: "connected",
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedAccounts = accounts.map((acc) => ({
      id: acc.id,
      displayName: acc.displayName || acc.email || acc.provider,
      provider: acc.provider,
      email: acc.email,
    }));

    return NextResponse.json({ accounts: formattedAccounts });
  } catch (err: any) {
    console.error("GET connected accounts error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
