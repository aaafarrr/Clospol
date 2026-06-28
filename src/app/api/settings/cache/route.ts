import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAuthenticatedUser } from "@/lib/auth";
import prisma from "@/lib/db";

const STREAMS_PATH = path.join(process.cwd(), "public", "streams");
const NEXT_CACHE_PATH = path.join(process.cwd(), ".next", "cache");

// Helper to calculate directory size and file count recursively
function getDirStats(dirPath: string): { size: number; filesCount: number } {
  let size = 0;
  let filesCount = 0;

  if (!fs.existsSync(dirPath)) {
    return { size, filesCount };
  }

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        const sub = getDirStats(filePath);
        size += sub.size;
        filesCount += sub.filesCount;
      } else {
        size += stats.size;
        filesCount++;
      }
    }
  } catch (err) {
    // Ignore reading errors for locked files
  }

  return { size, filesCount };
}

// Helper to clean directory files recursively, skipping active processes/locked files
function cleanDirectory(dirPath: string): { filesDeleted: number; bytesFreed: number } {
  let filesDeleted = 0;
  let bytesFreed = 0;

  if (!fs.existsSync(dirPath)) {
    return { filesDeleted, bytesFreed };
  }

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        const sub = cleanDirectory(filePath);
        filesDeleted += sub.filesDeleted;
        bytesFreed += sub.bytesFreed;
        // Try removing the folder itself if empty
        try {
          fs.rmdirSync(filePath);
        } catch (e) {
          // Folder is not empty or locked
        }
      } else {
        try {
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          bytesFreed += fileSize;
          filesDeleted++;
        } catch (e) {
          // File is locked or currently being read by server/FFmpeg process
        }
      }
    }
  } catch (err) {
    // Ignore read errors
  }

  return { filesDeleted, bytesFreed };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const streamsStats = getDirStats(STREAMS_PATH);
    const nextStats = getDirStats(NEXT_CACHE_PATH);

    // Fetch database logs counts
    const auditLogsCount = await prisma.auditLog.count({
      where: { userId: user.id }
    });
    const uploadSessionsCount = await prisma.uploadSession.count({
      where: { userId: user.id }
    });
    const expiredSessionsCount = await prisma.userSession.count({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } }
        ]
      }
    });
    const expiredPreviewTokensCount = await prisma.filePreviewToken.count({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() }
      }
    });
    const expiredHandoffsCount = await prisma.authHandoff.count({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } }
        ]
      }
    });

    const totalDbLogs = auditLogsCount + uploadSessionsCount + expiredSessionsCount + expiredPreviewTokensCount + expiredHandoffsCount;

    return NextResponse.json({
      success: true,
      stats: {
        cctv: {
          sizeBytes: streamsStats.size,
          filesCount: streamsStats.filesCount,
        },
        next: {
          sizeBytes: nextStats.size,
          filesCount: nextStats.filesCount,
        },
        dbLogs: {
          auditLogsCount,
          uploadSessionsCount,
          expiredSessionsCount,
          expiredPreviewTokensCount,
          expiredHandoffsCount,
          totalCount: totalDbLogs,
        },
        total: {
          sizeBytes: streamsStats.size + nextStats.size,
          filesCount: streamsStats.filesCount + nextStats.filesCount,
        }
      }
    });
  } catch (err: any) {
    console.error("GET cache stats error:", err);
    return NextResponse.json({ error: "Failed to query cache statistics" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const streamsResult = cleanDirectory(STREAMS_PATH);
    const nextResult = cleanDirectory(NEXT_CACHE_PATH);

    // Purge database logs and upload sessions
    const deletedLogs = await prisma.auditLog.deleteMany({
      where: { userId: user.id }
    });
    const deletedUploadSessions = await prisma.uploadSession.deleteMany({
      where: { userId: user.id }
    });

    // Purge expired sessions, preview tokens, and handoffs
    const deletedSessions = await prisma.userSession.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } }
        ]
      }
    });
    const deletedPreviewTokens = await prisma.filePreviewToken.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() }
      }
    });
    const deletedHandoffs = await prisma.authHandoff.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } }
        ]
      }
    });

    // Recreate transcode stream root directory in public/streams just in case it was fully cleaned
    if (!fs.existsSync(STREAMS_PATH)) {
      try {
        fs.mkdirSync(STREAMS_PATH, { recursive: true });
      } catch (e) {}
    }

    const totalLogsDeleted = deletedLogs.count + deletedUploadSessions.count + deletedSessions.count + deletedPreviewTokens.count + deletedHandoffs.count;

    return NextResponse.json({
      success: true,
      message: "Cache and system logs cleaned successfully.",
      result: {
        filesDeleted: streamsResult.filesDeleted + nextResult.filesDeleted,
        bytesFreed: streamsResult.bytesFreed + nextResult.bytesFreed,
        logsDeleted: totalLogsDeleted,
      }
    });
  } catch (err: any) {
    console.error("POST clean cache error:", err);
    return NextResponse.json({ error: "Failed to purge cache directories" }, { status: 500 });
  }
}
