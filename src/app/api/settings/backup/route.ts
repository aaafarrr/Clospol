import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const includeEnv = searchParams.get("env") === "true";
    const includeDb = searchParams.get("db") === "true";
    const includeFiles = searchParams.get("files") === "true";

    if (!includeEnv && !includeDb && !includeFiles) {
      return NextResponse.json({ error: "Please select at least one module to backup." }, { status: 400 });
    }

    const zip = new AdmZip();

    // 1. Add .env file if it exists and is selected
    if (includeEnv) {
      const envPath = path.resolve(".env");
      if (fs.existsSync(envPath)) {
        zip.addLocalFile(envPath);
      }
    }

    // 2. Add dev.db database file if it exists and is selected
    if (includeDb) {
      const dbPath = path.resolve("dev.db");
      if (fs.existsSync(dbPath)) {
        zip.addLocalFile(dbPath);
      }
    }

    // 3. Add storage/local directory recursively if it exists and is selected
    if (includeFiles) {
      const localDir = path.resolve("storage/local");
      if (fs.existsSync(localDir) && fs.statSync(localDir).isDirectory()) {
        zip.addLocalFolder(localDir, "storage/local");
      }
    }

    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="clospol-backup-${Date.now()}.zip"`,
      },
    });

  } catch (err: any) {
    console.error("Backup trigger route error:", err);
    return NextResponse.json({ error: err.message || "Failed to create backup" }, { status: 500 });
  }
}
