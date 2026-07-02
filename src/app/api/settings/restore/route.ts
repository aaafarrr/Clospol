import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { sqlite } from "@/db";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as any;

    if (!file) {
      return NextResponse.json({ error: "Backup file is required." }, { status: 400 });
    }

    const restoreEnv = formData.get("restoreEnv") === "true";
    const restoreDb = formData.get("restoreDb") === "true";
    const restoreFiles = formData.get("restoreFiles") === "true";

    if (!restoreEnv && !restoreDb && !restoreFiles) {
      return NextResponse.json({ error: "Please select at least one module to restore." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);

    // Verify backup structure and validate selection
    const entries = zip.getEntries();
    const hasEnv = entries.some(e => e.entryName === ".env");
    const hasDb = entries.some(e => e.entryName === "dev.db");
    const hasFiles = entries.some(e => e.entryName.startsWith("storage/local/"));

    if (restoreEnv && !hasEnv) {
      return NextResponse.json({ error: "The uploaded backup ZIP does not contain configuration data (.env)" }, { status: 400 });
    }
    if (restoreDb && !hasDb) {
      return NextResponse.json({ error: "The uploaded backup ZIP does not contain database metadata (dev.db)" }, { status: 400 });
    }
    if (restoreFiles && !hasFiles) {
      return NextResponse.json({ error: "The uploaded backup ZIP does not contain local storage files" }, { status: 400 });
    }

    let restartRequired = false;

    // 1. Restore config
    if (restoreEnv && hasEnv) {
      zip.extractEntryTo(".env", "./", false, true);
    }

    // 2. Restore local files
    if (restoreFiles && hasFiles) {
      for (const entry of entries) {
        if (entry.entryName.startsWith("storage/local/")) {
          zip.extractEntryTo(entry.entryName, "./", true, true);
        }
      }
    }

    // 3. Restore database
    if (restoreDb && hasDb) {
      console.log("[Restore] Restoring database file. Closing SQLite database...");
      try {
        sqlite.close();
      } catch (dbErr: any) {
        console.warn("[Restore] Database connection close warning:", dbErr.message);
      }
      
      const targetDbPath = process.env.DATABASE_PATH 
        ? path.resolve(process.env.DATABASE_PATH)
        : path.resolve("dev.db");
      
      const targetDir = path.dirname(targetDbPath);
      const targetName = path.basename(targetDbPath);
      
      // Extract the "dev.db" file from the ZIP into the target directory
      zip.extractEntryTo("dev.db", targetDir, false, true);
      
      // If the target filename is not "dev.db", rename it accordingly
      if (targetName !== "dev.db") {
        const extractedPath = path.join(targetDir, "dev.db");
        if (fs.existsSync(extractedPath)) {
          if (fs.existsSync(targetDbPath)) {
            fs.unlinkSync(targetDbPath);
          }
          fs.renameSync(extractedPath, targetDbPath);
        }
      }
      
      restartRequired = true;
    }


    if (restartRequired) {
      console.log("[Restore] Platform restore complete. Scheduling process exit for restart...");
      setTimeout(() => {
        console.log("[Restore] Exiting process now.");
        process.exit(0);
      }, 1500);
    }

    return NextResponse.json({
      success: true,
      restartRequired,
      message: restartRequired
        ? "Platform successfully restored. System is restarting..."
        : "Backup components successfully restored.",
    });

  } catch (err: any) {
    console.error("Restore backup error:", err);
    return NextResponse.json({ error: err.message || "Failed to restore backup" }, { status: 500 });
  }
}
