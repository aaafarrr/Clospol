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

    // 1. Parse backup env if present to resolve credentials keys
    const backupEnvEntry = zip.getEntry(".env");
    const backupEnvContent = backupEnvEntry ? backupEnvEntry.getData().toString("utf8") : "";
    const backupAppKeyMatch = backupEnvContent.match(/^APP_KEY\s*=\s*(.*)$/m);
    const backupAppKey = backupAppKeyMatch ? backupAppKeyMatch[1].trim() : "";

    const envPath = path.resolve(".env");
    let serverEnvContent = "";
    if (fs.existsSync(envPath)) {
      serverEnvContent = fs.readFileSync(envPath, "utf8");
    }

    let updatedEnv = serverEnvContent;

    if (restoreEnv && hasEnv) {
      // Merge configuration instead of plain overwrite to preserve host specific domains/ports
      const backupLines = backupEnvContent.split(/\r?\n/);
      for (const line of backupLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const parts = trimmed.split("=");
          const key = parts[0].trim();
          const val = parts.slice(1).join("=").trim();
          
          if (key === "APP_KEY" && restoreDb && backupAppKey) {
            // Overwrite APP_KEY if database is restored
            if (updatedEnv.match(new RegExp(`^${key}\\s*=`, "m"))) {
              updatedEnv = updatedEnv.replace(new RegExp(`^${key}\\s*=.*$`, "m"), `${key}=${backupAppKey}`);
            } else {
              updatedEnv += `\n${key}=${backupAppKey}\n`;
            }
          } else {
            // Add new variables only if they don't already exist on the server
            const keyRegex = new RegExp(`^${key}\\s*=`, "m");
            if (!updatedEnv.match(keyRegex)) {
              updatedEnv += `\n${key}=${val}\n`;
            }
          }
        }
      }
      restartRequired = true;
    } else if (restoreDb && hasDb && backupAppKey) {
      // Even if user does NOT restore configuration, if we restore the database we MUST
      // automatically sync the APP_KEY to match the database for encryption/decryption.
      const key = "APP_KEY";
      if (updatedEnv.match(new RegExp(`^${key}\\s*=`, "m"))) {
        updatedEnv = updatedEnv.replace(new RegExp(`^${key}\\s*=.*$`, "m"), `${key}=${backupAppKey}`);
      } else {
        updatedEnv += `\n${key}=${backupAppKey}\n`;
      }
      restartRequired = true;
    }

    if (updatedEnv !== serverEnvContent) {
      fs.writeFileSync(envPath, updatedEnv, "utf8");
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

      // Map and update the user ID inside the restored database file
      try {
        const DatabaseConstructor = require("better-sqlite3");
        const tempDb = new DatabaseConstructor(targetDbPath);
        try {
          let oldUserId: string | null = null;
          
          // Try finding old user ID by email first
          const userRow = tempDb.prepare("SELECT id FROM users WHERE email = ?").get(user.email);
          if (userRow) {
            oldUserId = userRow.id;
          } else {
            // Fallback: if there is only 1 user, use that
            const usersList = tempDb.prepare("SELECT id FROM users").all();
            if (usersList.length === 1) {
              oldUserId = usersList[0].id;
            } else if (usersList.length > 0) {
              oldUserId = usersList[0].id;
            }
          }

          if (oldUserId && oldUserId !== user.id) {
            console.log(`[Restore] Mapping database records from user ID ${oldUserId} to active user ID ${user.id}...`);
            const tables = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            
            tempDb.transaction(() => {
              for (const tbl of tables) {
                const tableName = tbl.name;
                if (tableName === "sqlite_sequence") continue;
                
                const columns = tempDb.prepare(`PRAGMA table_info(${tableName})`).all();
                for (const col of columns) {
                  const colName = col.name;
                  if (
                    (tableName === "users" && colName === "id") ||
                    (colName === "user_id") ||
                    (colName === "inviter_id")
                  ) {
                    tempDb.prepare(`UPDATE ${tableName} SET ${colName} = ? WHERE ${colName} = ?`).run(user.id, oldUserId);
                  }
                }
              }
            })();
            console.log("[Restore] User ID mapping completed successfully.");
          }
        } catch (mapErr: any) {
          console.error("[Restore] Error mapping user ID in restored database:", mapErr.message);
        } finally {
          tempDb.close();
        }
      } catch (loadErr: any) {
        console.error("[Restore] Failed to initialize better-sqlite3 for mapping:", loadErr.message);
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
