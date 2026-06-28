import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { DatabaseBackupService } from "@/services/database-backup";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { driver, host, port, database, username, password, headers } = body;

    if (!driver || !database) {
      return NextResponse.json({ error: "Driver and database name/path are required" }, { status: 400 });
    }

    try {
      await DatabaseBackupService.testConnection(
        driver,
        driver === "sqlite" ? "localhost" : host,
        driver === "sqlite" ? 0 : Number(port),
        database,
        driver === "sqlite" ? "" : username,
        driver === "sqlite" ? "" : (password || ""),
        headers || {}
      );

      return NextResponse.json({ status: "ok", message: "Connection succeeded." });
    } catch (testErr: any) {
      return NextResponse.json(
        { status: "error", error: testErr.message || "Connection test to target database failed." },
        { status: 400 }
      );
    }
  } catch (err: any) {
    console.error("Database backup test connection error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
