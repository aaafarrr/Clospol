import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const apiKey = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)),
    });

    if (!apiKey) {
      return NextResponse.json({ error: "API Key not found" }, { status: 404 });
    }

    // Revoke key by status update rather than physical deletion to preserve logs, as in standard systems
    await db.update(apiKeys)
      .set({
        status: "revoked",
        // @ts-ignore
        revokedAt: new Date().getTime(),
      })
      .where(eq(apiKeys.id, apiKey.id));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE api key error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
