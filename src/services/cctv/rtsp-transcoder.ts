import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

interface TranscodeSession {
  process: ChildProcess;
  cameraId: string;
  rtspUrl: string;
  outputDir: string;
  playlistPath: string;
  lastHeartbeat: number;
}

export class RtspTranscoderService {
  private static sessions: Map<string, TranscodeSession> = new Map();
  private static intervalStarted = false;

  /**
   * Start a transcoding session for an RTSP camera stream if it doesn't already exist.
   * Returns the relative path to the HLS playlist file (.m3u8).
   */
  static async startSession(cameraId: string, rtspUrl: string): Promise<string> {
    // Check if session already exists
    const existing = this.sessions.get(cameraId);
    if (existing) {
      existing.lastHeartbeat = Date.now();
      return `/api/streams/${cameraId}/index.m3u8`;
    }

    const streamRelativeDir = `/api/streams/${cameraId}`;
    const outputDir = path.join(process.cwd(), "public", "streams", cameraId);

    // Clean up old HLS files for this camera if any
    if (fs.existsSync(outputDir)) {
      try {
        fs.rmSync(outputDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`[Transcoder] Failed to clean up old stream dir for ${cameraId}:`, err);
      }
    }
    fs.mkdirSync(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, "index.m3u8");
    const relativePlaylistPath = ["public", "streams", cameraId, "index.m3u8"].join("/");

    // FFmpeg arguments optimized for low latency and zero re-encoding CPU overhead:
    // -rtsp_transport tcp: force TCP to avoid UDP packet loss corruption
    // -c:v copy: copy video track without re-encoding (instant, near-zero CPU)
    // -an: disable audio track (prevents failures if camera has incompatible/no audio track)
    // -hls_time 2: 2-second segments for lower latency
    // -hls_list_size 3: keep only the last 3 segments to minimize disk usage
    // -hls_flags delete_segments: delete old segments as new ones are generated
    const ffmpegArgs = [
      "-loglevel", "error",
      "-fflags", "nobuffer",
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-c:v", "copy",
      "-an",
      "-hls_time", "2",
      "-hls_list_size", "3",
      "-hls_flags", "delete_segments",
      "-f", "hls",
      playlistPath
    ];


    console.log(`[Transcoder] Spawning FFmpeg for camera ${cameraId}. Path: ${ffmpegInstaller.path}`);


    const child = spawn(ffmpegInstaller.path, ffmpegArgs, {
      stdio: ["ignore", "ignore", "pipe"], // pipe stderr for log messages, ignore stdin/stdout
      detached: false
    });

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        const errorText = data.toString().trim();
        if (errorText) {
          console.error(`[Transcoder FFmpeg ${cameraId} Error]: ${errorText}`);
        }
      });
    }

    child.on("error", (err) => {
      console.error(`[Transcoder] Failed to start FFmpeg process for camera ${cameraId}:`, err);
      this.sessions.delete(cameraId);
    });

    child.on("close", (code) => {
      console.log(`[Transcoder] FFmpeg process for camera ${cameraId} exited with code ${code}`);
      this.sessions.delete(cameraId);
    });

    this.sessions.set(cameraId, {
      process: child,
      cameraId,
      rtspUrl,
      outputDir,
      playlistPath,
      lastHeartbeat: Date.now()
    });

    // Start heartbeat check daemon
    this.startHeartbeatCheck();

    return `${streamRelativeDir}/index.m3u8`;
  }

  /**
   * Update the heartbeat of an active transcoding session to keep it alive.
   */
  static keepAlive(cameraId: string): boolean {
    const session = this.sessions.get(cameraId);
    if (session) {
      session.lastHeartbeat = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Stop a transcoding session and clean up its temporary files on disk.
   */
  static stopSession(cameraId: string): void {
    const session = this.sessions.get(cameraId);
    if (session) {
      console.log(`[Transcoder] Stopping session for camera ${cameraId}`);
      try {
        session.process.kill("SIGTERM");
      } catch (err) {
        console.error(`[Transcoder] Failed to terminate FFmpeg process for ${cameraId}:`, err);
      }
      this.sessions.delete(cameraId);

      // Clean up files after a short delay to allow FFmpeg to exit completely
      setTimeout(() => {
        if (fs.existsSync(session.outputDir)) {
          try {
            fs.rmSync(session.outputDir, { recursive: true, force: true });
            console.log(`[Transcoder] Cleaned up temporary directory for camera ${cameraId}`);
          } catch (err) {
            console.error(`[Transcoder] Failed to delete HLS files for camera ${cameraId}:`, err);
          }
        }
      }, 3000);
    }
  }

  /**
   * Periodically check for inactive sessions (no client heartbeat for > 15s) and stop them.
   */
  private static startHeartbeatCheck(): void {
    if (this.intervalStarted) return;
    this.intervalStarted = true;

    setInterval(() => {
      const now = Date.now();
      for (const [cameraId, session] of this.sessions.entries()) {
        if (now - session.lastHeartbeat > 15000) {
          console.log(`[Transcoder] Camera ${cameraId} timed out (no heartbeat for 15s)`);
          this.stopSession(cameraId);
        }
      }
    }, 5000);
  }
}
