import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get("integrationId") || "";
    const type = searchParams.get("type") || "all";
    const query = searchParams.get("query") || "";

    let sql = `
      SELECT m.*, i.integration_name, i.provider
      FROM integration_messages m
      LEFT JOIN messenger_integrations i ON m.integration_id = i.id
      WHERE m.user_id = ?
    `;
    const params: any[] = [user.id];

    if (integrationId) {
      sql += " AND m.integration_id = ?";
      params.push(integrationId);
    }

    if (type !== "all") {
      sql += " AND m.message_type = ?";
      params.push(type);
    }

    if (query) {
      sql += " AND (m.content LIKE ? OR m.sender_name LIKE ? OR m.chat_name LIKE ?)";
      const lq = `%${query}%`;
      params.push(lq, lq, lq);
    }

    sql += " ORDER BY m.created_at DESC";

    const rows = sqlite.prepare(sql).all(...params);

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error("GET integration messages error:", err);
    return NextResponse.json({ error: err.message || "Failed to load messages" }, { status: 500 });
  }
}
