const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Helper to read database path from env or defaults
function getDbPath() {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }

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

console.log(`[db-reset] Target database to reset: ${dbPath}`);

// Delete database files if they exist
const filesToDelete = [
  dbPath,
  `${dbPath}-journal`,
  `${dbPath}-wal`,
  `${dbPath}-shm`
];

let deletedAny = false;
filesToDelete.forEach(file => {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`[db-reset] Deleted: ${file}`);
      deletedAny = true;
    } catch (err) {
      console.error(`[db-reset] Failed to delete file ${file}:`, err.message);
    }
  }
});

if (!deletedAny) {
  console.log("[db-reset] No existing database files found to delete.");
}

console.log("[db-reset] Re-initializing database schema...");
try {
  execSync("npx drizzle-kit push", { stdio: "inherit" });
  console.log("[db-reset] Database reset and re-initialized successfully.");
} catch (err) {
  console.error("[db-reset] Failed to initialize new database:", err.message);
  process.exit(1);
}
