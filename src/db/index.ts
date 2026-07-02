import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as relations from './relations';
import fs from 'fs';
import path from 'path';

export const sqlite = new Database(process.env.DATABASE_PATH || './dev.db');
export const db = drizzle(sqlite, { schema: { ...schema, ...relations } });

// Dynamically create integration_messages table if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS integration_messages (
    id TEXT PRIMARY KEY,
    integration_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_avatar TEXT,
    chat_name TEXT NOT NULL,
    chat_type TEXT NOT NULL,
    message_type TEXT NOT NULL,
    content TEXT,
    media_url TEXT,
    media_size INTEGER,
    mime_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

function acquireDaemonLock(): boolean {
  if (typeof window !== 'undefined') return false;
  const lockDir = path.resolve('storage');
  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }
  const lockFile = path.join(lockDir, 'daemons.pid');

  try {
    if (fs.existsSync(lockFile)) {
      const pidStr = fs.readFileSync(lockFile, 'utf8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        if (pid === process.pid) {
          return true; // Already locked by us
        }
        try {
          // Check if process is still running
          process.kill(pid, 0);
          // Process is running, we shouldn't start daemons in this worker/subprocess
          return false;
        } catch (e: any) {
          // ESRCH means process doesn't exist, we can take the lock
          if (e.code !== 'ESRCH') {
            return false; 
          }
        }
      }
    }

    // Write current PID to lock file
    fs.writeFileSync(lockFile, String(process.pid), 'utf8');

    // Setup cleanup on exit
    const cleanup = () => {
      try {
        if (fs.existsSync(lockFile)) {
          const currentPid = fs.readFileSync(lockFile, 'utf8').trim();
          if (currentPid === String(process.pid)) {
            fs.unlinkSync(lockFile);
          }
        }
      } catch (_) {}
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    return true;
  } catch (err) {
    console.error('[Bootloader] Error checking/acquiring daemon lock:', err);
    return false;
  }
}

// Background Daemons Bootloader (CCTV Recording Scheduler & WhatsApp/Discord Integrations)
const isNextProcess = typeof process !== 'undefined' && process.argv && process.argv.some(arg => arg.includes('next'));
if (typeof window === 'undefined' && isNextProcess && !(process as any).daemonsStarted) {
  if (acquireDaemonLock()) {
    (process as any).daemonsStarted = true;
    // Dynamic imports to avoid circular dependency load locks
    Promise.resolve().then(async () => {
      try {
        console.log(`[Bootloader] Initializing background daemons inside Next.js process (PID: ${process.pid})...`);
        
        // 1. Boot CCTV scheduled captures and recording blocks
        const { CctvService } = await import("@/services/cctv/cctv");
        CctvService.syncScheduledTasks().catch((err) => {
          console.error("[Bootloader] CCTV scheduler failed to initialize:", err);
        });

        // 2. Boot Messenger active integrations (WhatsApp / Discord bots)
        const { MessengerDaemon } = await import("@/services/messenger/daemon");
        MessengerDaemon.initDaemon().catch((err) => {
          console.error("[Bootloader] Messenger integrations failed to initialize:", err);
        });

        // 3. Boot Trash Cleanup Scheduler (run once on startup, then every 24 hours)
        const { TrashCleanupService } = await import("@/services/storage/cleanup");
        TrashCleanupService.runCleanup().catch((err) => {
          console.error("[Bootloader] Trash cleanup failed:", err);
        });
        setInterval(() => {
          TrashCleanupService.runCleanup().catch((err) => {
            console.error("[Bootloader] Trash cleanup failed:", err);
          });
        }, 24 * 60 * 60 * 1000);
        
      } catch (err) {
        console.error("[Bootloader] Failed to run bootloader sequences:", err);
      }
    });
  }
}

