import { Readable } from "stream";
import path from "path";
import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import { spawn } from "child_process";
import fs from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { CctvCamera, ConnectedAccount, Folder, File } from "@prisma/client";
import { OnvifService } from "./onvif";
import { StorageUploaderService } from "../storage/uploader";
import { UploadRoutingService } from "../storage/routing";
import { LocalStorageService } from "../storage/local";
import { S3StorageService } from "../storage/s3";
import { GoogleDriveService } from "../storage/google";
import cron from "node-cron";

export class CctvService {
  /**
   * Validate HLS playlists, HTTP snapshot URLs, or ONVIF connections.
   */
  static async testConnection(streamUrl: string, snapshotUrl?: string | null, headers: Record<string, any> = {}): Promise<boolean> {
    // 1. Validate ONVIF
    if (headers && headers.__onvif__) {
      try {
        const onvif = headers.__onvif__;
        const details = await OnvifService.connectAndFetch(onvif.url, onvif.username, onvif.password);
        if (details.snapshot_url) {
          try {
            const snapshotBuffer = await OnvifService.fetchOnvifSnapshot(details.snapshot_url, onvif.username, onvif.password);
            if (snapshotBuffer.length === 0) {
              throw new Error("ONVIF camera returned empty snapshot buffer.");
            }
          } catch (snapErr: any) {
            console.warn(`ONVIF snapshot fetch failed during test (non-fatal): ${snapErr.message}`);
          }
        }
        return true;
      } catch (err: any) {
        throw new Error(`ONVIF connection test failed: ${err.message}`);
      }
    }

    // 2. Validate HLS Stream URL (check for #EXTM3U playlist header) - skip for RTSP
    if (streamUrl && !streamUrl.toLowerCase().startsWith("rtsp://")) {
      try {
        const response = await fetch(streamUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          throw new Error(`HLS stream returned HTTP status ${response.status}`);
        }
        const bodyText = await response.text();
        if (!bodyText.includes("#EXTM3U")) {
          throw new Error("HLS stream does not contain a valid M3U8 playlist header (#EXTM3U tag).");
        }
      } catch (err: any) {
        throw new Error(`CCTV Live Stream verification failed: ${err.message}`);
      }
    }

    // 3. Validate HTTP Snapshot URL
    if (snapshotUrl) {
      try {
        const response = await fetch(snapshotUrl, {
          headers: headers || {},
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
          throw new Error(`Snapshot URL returned HTTP status ${response.status}`);
        }
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("image/")) {
          throw new Error(`Snapshot URL returned non-image content type: ${contentType}`);
        }
      } catch (err: any) {
        console.warn(`CCTV Snapshot verification failed (non-fatal): ${err.message}`);
      }
    }

    return true;
  }

  /**
   * Generates a clean, professional timestamp formatted in the system's local timezone (TZ env var).
   * Example output: 20260620_183309
   */
  private static getFilenameTimestamp(): string {
    const tz = process.env.TZ || "Asia/Jakarta";
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
      return `${partMap.year}${partMap.month}${partMap.day}_${partMap.hour}${partMap.minute}${partMap.second}`;
    } catch (e) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const date = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      return `${year}${month}${date}_${hours}${minutes}${seconds}`;
    }
  }

  /**
   * Helper to parse and create CCTV virtual folder tree structure.
   * Root CCTV Recordings -> Camera Name -> YYYY-MM
   */
  static async getOrCreateCctvFolderPath(userId: string, storageAccount: ConnectedAccount, cameraName: string): Promise<Folder> {
    const yearMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

    // 1. Root CCTV folder
    const rootFolderName = "CCTV Recordings";
    let rootFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: null,
        name: rootFolderName,
        deletedAt: null,
      },
    });

    if (!rootFolder) {
      rootFolder = await prisma.folder.create({
        data: {
          userId,
          name: rootFolderName,
          parentId: null,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#ef4444", // security/video red color
          iconUrl: "https://api.iconify.design/lucide:video.svg",
          isStarred: false,
        },
      });
    }

    // 2. Camera folder
    let cameraFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: rootFolder.id,
        name: cameraName,
        deletedAt: null,
      },
    });

    if (!cameraFolder) {
      cameraFolder = await prisma.folder.create({
        data: {
          userId,
          name: cameraName,
          parentId: rootFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#3b82f6",
          iconUrl: "https://api.iconify.design/lucide:camera.svg",
          isStarred: false,
        },
      });
    }

    // 3. Month folder
    let monthFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: cameraFolder.id,
        name: yearMonth,
        deletedAt: null,
      },
    });

    if (!monthFolder) {
      monthFolder = await prisma.folder.create({
        data: {
          userId,
          name: yearMonth,
          parentId: cameraFolder.id,
          connectedAccountId: storageAccount.id,
          provider: storageAccount.provider,
          color: "#64748b",
          iconUrl: "https://api.iconify.design/lucide:calendar.svg",
          isStarred: false,
        },
      });
    }

    return monthFolder;
  }

  /**
   * Capture a single snapshot image from CCTV.
   */
  static async captureSnapshot(camera: CctvCamera): Promise<void> {
    let snapshotHeaders: Record<string, any> = {};
    try {
      if (camera.snapshotHeaders) {
        snapshotHeaders = JSON.parse(camera.snapshotHeaders);
      }
    } catch (_) {}

    try {
      let imageBuffer: Buffer;

      if (snapshotHeaders.__onvif__) {
        const onvif = snapshotHeaders.__onvif__;
        let snapUrl = camera.snapshotUrl;
        if (!snapUrl) {
          try {
            const details = await OnvifService.connectAndFetch(onvif.url, onvif.username, onvif.password);
            snapUrl = details.snapshot_url;
          } catch (e: any) {
            console.error("Failed to dynamically fetch ONVIF snapshot URL:", e);
          }
        }
        if (!snapUrl) {
          throw new Error("No snapshot URL available for ONVIF camera.");
        }
        imageBuffer = await OnvifService.fetchOnvifSnapshot(snapUrl, onvif.username, onvif.password);
      } else {
        if (!camera.snapshotUrl) {
          throw new Error(`No snapshot URL configured for camera: ${camera.name}`);
        }
        const response = await fetch(camera.snapshotUrl, {
          headers: snapshotHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(`Failed to download snapshot: HTTP status ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }

      if (imageBuffer.length === 0) {
        throw new Error("Zero-byte snapshot buffer returned.");
      }

      // Resolve destination storage
      let storageAccount: ConnectedAccount | null = null;
      if (camera.connectedAccountId) {
        storageAccount = await prisma.connectedAccount.findUnique({
          where: { id: camera.connectedAccountId },
        });
      }

      if (!storageAccount) {
        // Evaluate dynamic upload policy routing
        storageAccount = await UploadRoutingService.selectRoutingAccount(camera.userId, imageBuffer.length);
      }

      if (!storageAccount) {
        throw new Error("No active storage account resolved for CCTV upload.");
      }

      // Setup destination folder
      const folder = await this.getOrCreateCctvFolderPath(camera.userId, storageAccount, camera.name);

      const cleanName = camera.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const timestamp = this.getFilenameTimestamp();
      const fileName = `cctv_${cleanName}_${timestamp}.jpg`;

      // Upload stream
      const stream = Readable.from(imageBuffer);
      await StorageUploaderService.uploadAndSaveFile(
        camera.userId,
        storageAccount,
        fileName,
        "image/jpeg",
        imageBuffer.length,
        folder.id,
        stream
      );

      // Update camera capture log
      await prisma.cctvCamera.update({
        where: { id: camera.id },
        data: {
          lastCaptureAt: new Date(),
          lastCaptureStatus: "success",
          lastCaptureError: null,
        },
      });

      // Enforce retention rules
      await this.enforceRetention(camera, folder.id);

    } catch (err: any) {
      console.error(`CCTV snapshot capture failed for camera ${camera.id}: ${err.message}`);
      await prisma.cctvCamera.update({
        where: { id: camera.id },
        data: {
          lastCaptureAt: new Date(),
          lastCaptureStatus: "failed",
          lastCaptureError: err.message,
        },
      });
      throw err;
    }
  }

  /**
   * Concatenate HLS stream segments or capture a clip from RTSP into a video file and save it.
   */
  static async recordHlsClip(camera: CctvCamera): Promise<void> {
    try {
      const isRtsp = camera.streamUrl.toLowerCase().startsWith("rtsp://");
      let videoData: Buffer;

      // Record a clip from stream using FFmpeg
      const tempDir = path.join(process.cwd(), "public", "streams");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const uniqueId = randomUUID();
      const tempFilePath = path.join(tempDir, `temp_rec_${camera.id}_${uniqueId}.mp4`);

      const intervalMinutes = camera.recordInterval || 5;
      const durationSeconds = intervalMinutes * 60;

      const ffmpegArgs = [
        "-loglevel", "error",
        "-y",
      ];

      if (isRtsp) {
        ffmpegArgs.push("-rtsp_transport", "tcp");
      }

      ffmpegArgs.push(
        "-i", camera.streamUrl,
        "-t", String(durationSeconds),
        "-c:v", "copy",
        "-c:a", "aac",
        tempFilePath
      );

      console.log(`[CctvService] Spawning FFmpeg to record clip for camera ${camera.name} (${camera.id}). Path: ${ffmpegInstaller.path}`);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(ffmpegInstaller.path, ffmpegArgs, { stdio: "ignore" });
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch (_) {}
          reject(new Error("FFmpeg recording timed out (stream might be inactive or unreachable)."));
        }, durationSeconds * 1000 + 15000);

        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg recording exited with code ${code}`));
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      if (!fs.existsSync(tempFilePath)) {
        throw new Error("FFmpeg failed to record stream clip (output file not generated).");
      }

      videoData = fs.readFileSync(tempFilePath);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {}

      // Resolve destination storage
      let storageAccount: ConnectedAccount | null = null;
      if (camera.connectedAccountId) {
        storageAccount = await prisma.connectedAccount.findUnique({
          where: { id: camera.connectedAccountId },
        });
      }

      if (!storageAccount) {
        storageAccount = await UploadRoutingService.selectRoutingAccount(camera.userId, videoData.length);
      }

      if (!storageAccount) {
        throw new Error("No active storage account resolved for CCTV upload.");
      }

      const folder = await this.getOrCreateCctvFolderPath(camera.userId, storageAccount, camera.name);

      const cleanName = camera.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const timestamp = this.getFilenameTimestamp();
      const fileName = `cctv_${cleanName}_${timestamp}.mp4`;

      const stream = Readable.from(videoData);
      await StorageUploaderService.uploadAndSaveFile(
        camera.userId,
        storageAccount,
        fileName,
        "video/mp4",
        videoData.length,
        folder.id,
        stream
      );

      // Log success
      await prisma.cctvCamera.update({
        where: { id: camera.id },
        data: {
          lastCaptureAt: new Date(),
          lastCaptureStatus: "success",
          lastCaptureError: null,
        },
      });

      // Enforce retention
      await this.enforceRetention(camera, folder.id);

    } catch (err: any) {
      console.error(`CCTV recording failed for camera ${camera.id}: ${err.message}`);
      await prisma.cctvCamera.update({
        where: { id: camera.id },
        data: {
          lastCaptureAt: new Date(),
          lastCaptureStatus: "failed",
          lastCaptureError: err.message,
        },
      });
      throw err;
    }
  }

  /**
   * Save a live canvas snapshot frame uploaded from client browser.
   */
  static async uploadClientSnapshot(camera: CctvCamera, base64Data: string): Promise<boolean> {
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error("Invalid base64 image data payload.");
    }

    const imageBuffer = Buffer.from(matches[2], "base64");

    let storageAccount: ConnectedAccount | null = null;
    if (camera.connectedAccountId) {
      storageAccount = await prisma.connectedAccount.findUnique({
        where: { id: camera.connectedAccountId },
      });
    }

    if (!storageAccount) {
      storageAccount = await UploadRoutingService.selectRoutingAccount(camera.userId, imageBuffer.length);
    }

    if (!storageAccount) {
      throw new Error("No active storage account resolved for CCTV upload.");
    }

    const folder = await this.getOrCreateCctvFolderPath(camera.userId, storageAccount, camera.name);

    const cleanName = camera.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const timestamp = this.getFilenameTimestamp();
    const fileName = `cctv_${cleanName}_${timestamp}_client.jpg`;

    const stream = Readable.from(imageBuffer);
    await StorageUploaderService.uploadAndSaveFile(
      camera.userId,
      storageAccount,
      fileName,
      "image/jpeg",
      imageBuffer.length,
      folder.id,
      stream
    );

    await prisma.cctvCamera.update({
      where: { id: camera.id },
      data: {
        lastCaptureAt: new Date(),
        lastCaptureStatus: "success",
        lastCaptureError: null,
      },
    });

    await this.enforceRetention(camera, folder.id);
    return true;
  }

  /**
   * Remove files that exceed retention days configuration.
   */
  static async enforceRetention(camera: CctvCamera, folderId: string): Promise<void> {
    const retentionDays = camera.retentionDays || 7;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const oldFiles = await prisma.file.findMany({
      where: {
        userId: camera.userId,
        folderId: folderId,
        createdAt: { lt: cutoffDate },
      },
      include: {
        connectedAccount: true,
      },
    });

    for (const file of oldFiles) {
      try {
        if (file.provider === "s3") {
          await S3StorageService.deleteS3Object(file);
        } else if (file.provider === "local") {
          await LocalStorageService.deleteLocalFile(file);
        } else if (file.provider === "google_drive") {
          await GoogleDriveService.deleteGoogleFile(file);
        }
        
        // Remove from DB
        await prisma.file.delete({ where: { id: file.id } });
      } catch (err: any) {
        console.warn(`Failed to delete expired CCTV file ${file.name}: ${err.message}`);
      }
    }
  }

  /**
   * Helper to validate cron string.
   */
  static isValidCron(cronExpression: string): boolean {
    return cron.validate(cronExpression);
  }

  /**
   * Main scheduler trigger. Scans active cameras and fires snapshots or recordings.
   */
  static async runScheduledCaptures(): Promise<void> {
    const activeCameras = await prisma.cctvCamera.findMany({
      where: { status: "active" },
    });

    const currentMinute = new Date().getMinutes();

    for (const camera of activeCameras) {
      // 1. Cron-scheduled snap captures
      if (camera.scheduleCron) {
        try {
          if (cron.validate(camera.scheduleCron)) {
            // Evaluated by a background cron scheduler watcher (represented here as trigger-due verification)
            // If cron is due, we capture:
            // Since this is run inside a minute cron loop in Node, we can evaluate if the cron is due
            // node-cron tasks execute directly. When we boot the app, we will register active cameras
            // to node-cron tasks. This runScheduledCaptures function is a backup / manual runner.
          }
        } catch (err: any) {
          console.error(`Cron parsing failed for camera ${camera.id}: ${err.message}`);
        }
      }

      // 2. Continuous video streams
      if (camera.recordStream) {
        try {
          const interval = camera.recordInterval || 5;
          if (currentMinute % interval === 0) {
            await this.recordHlsClip(camera);
          }
        } catch (err: any) {
          console.error(`Continuous CCTV recording trigger failed for camera ${camera.id}: ${err.message}`);
        }
      }
    }
  }

  private static getActiveCronTasksMap(): Map<string, any[]> {
    const p = process as any;
    if (!p.activeCctvCronTasks) {
      p.activeCctvCronTasks = new Map<string, any[]>();
    }
    return p.activeCctvCronTasks;
  }

  /**
   * Synchronize cron tasks for all active CCTV cameras.
   */
  static async syncScheduledTasks(): Promise<void> {
    console.log("[CCTV Scheduler] Synchronizing active scheduled tasks...");
    
    const activeTasksMap = this.getActiveCronTasksMap();

    // Stop all running tasks
    for (const tasks of activeTasksMap.values()) {
      for (const task of tasks) {
        try {
          task.stop();
        } catch (_) {}
      }
    }
    activeTasksMap.clear();

    try {
      const activeCameras = await prisma.cctvCamera.findMany({
        where: { status: "active" },
      });

      for (const camera of activeCameras) {
        const cameraTasks: any[] = [];

        // 1. Cron-scheduled snap captures
        if (camera.scheduleCron && this.isValidCron(camera.scheduleCron)) {
          console.log(`[CCTV Scheduler] Scheduling snapshot capture cron "${camera.scheduleCron}" for camera: ${camera.name}`);
          const task = cron.schedule(camera.scheduleCron, async () => {
            try {
              console.log(`[CCTV Scheduler] Running scheduled snapshot capture for camera: ${camera.name}`);
              await this.captureSnapshot(camera);
            } catch (err: any) {
              console.error(`Scheduled capture failed for camera ${camera.name}:`, err.message);
            }
          }, {
            timezone: process.env.TZ || "Asia/Jakarta"
          });
          cameraTasks.push(task);
        }

        // 2. Continuous video stream recording blocks
        if (camera.recordStream) {
          const interval = camera.recordInterval || 5;
          const cronExpression = `*/${interval} * * * *`;
          console.log(`[CCTV Scheduler] Scheduling continuous recording cron "${cronExpression}" for camera: ${camera.name}`);
          const task = cron.schedule(cronExpression, async () => {
            try {
              console.log(`[CCTV Scheduler] Running scheduled stream recording block for camera: ${camera.name}`);
              await this.recordHlsClip(camera);
            } catch (err: any) {
              console.error(`Scheduled stream recording failed for camera ${camera.name}:`, err.message);
            }
          }, {
            timezone: process.env.TZ || "Asia/Jakarta"
          });
          cameraTasks.push(task);
        }

        if (cameraTasks.length > 0) {
          activeTasksMap.set(camera.id, cameraTasks);
        }
      }
      console.log(`[CCTV Scheduler] Successfully scheduled tasks for ${activeTasksMap.size} camera(s).`);
    } catch (err: any) {
      console.error("[CCTV Scheduler Error] Failed to sync scheduled tasks:", err.message);
    }
  }
}
