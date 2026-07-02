const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Helper to read database path from env or defaults
function getDbPath() {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }

  // Load from .env file manually if exists
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const dbPathMatch = envContent.match(/^DATABASE_PATH\s*=\s*(.+)$/m);
    if (dbPathMatch) {
      return path.resolve(dbPathMatch[1].trim().replace(/['"]/g, ""));
    }
    const dbUrlMatch = envContent.match(/^DATABASE_URL\s*=\s*(.+)$/m);
    if (dbUrlMatch) {
      const url = dbUrlMatch[1].trim().replace(/['"]/g, "");
      if (url.startsWith("file:")) {
        return path.resolve(url.replace("file:", ""));
      }
    }
  }

  return path.join(process.cwd(), "dev.db");
}

const dbPath = getDbPath();
const dbExists = fs.existsSync(dbPath);

console.log(`[db-setup] Checking database status at: ${dbPath}`);

if (!dbExists) {
  console.log("[db-setup] Database file not found. Initializing new database...");
  try {
    execSync("npx drizzle-kit push", { stdio: "inherit" });
    console.log("[db-setup] Database initialized successfully.");
  } catch (err) {
    console.error("[db-setup] Failed to initialize database:", err.message);
    process.exit(1);
  }
} else {
  console.log("[db-setup] Database already exists. Performing safe schema sync...");
  try {
    // Run drizzle-kit push with stdio: 'pipe' to catch interactive TTY prompts.
    execSync("npx drizzle-kit push", { stdio: "pipe" });
    console.log("[db-setup] Database schema synchronized successfully (no changes or non-destructive changes applied).");
  } catch (err) {
    const output = err.stdout ? err.stdout.toString() : "";
    const errorOutput = err.stderr ? err.stderr.toString() : "";

    if (output.includes("Warning  Found data-loss statements") || errorOutput.includes("TTY")) {
      console.warn("\n⚠️ [db-setup] WARNING: Database schema changes with potential data-loss detected.");
      console.warn("To safely review and apply these changes, please run manually:");
      console.warn("   npm run db:push\n");
    } else {
      console.error("[db-setup] Failed to synchronize schema:", err.message);
      if (output) console.log(output);
      if (errorOutput) console.error(errorOutput);
    }
  }
}
