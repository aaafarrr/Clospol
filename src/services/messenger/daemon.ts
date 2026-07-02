import fs from "fs";
import path from "path";
import { Readable } from "stream";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { Client, GatewayIntentBits } from "discord.js";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { UploadRoutingService } from "../storage/routing";
import { MessengerFolderService } from "./folder";
import { StorageUploaderService } from "../storage/uploader";

const pinoLogger = pino({ level: "silent" });
const storageDir = path.resolve("storage/whatsapp-sessions");

if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

interface WhatsAppSession {
  sock: any | null;
  status: "disconnected" | "connecting" | "qr_ready" | "connected";
  qr: string | null;
}

export class MessengerDaemon {
  private static activeWaSessions = new Map<string, WhatsAppSession>();
  private static activeDiscordClients = new Map<string, Client>();
  private static isInitialized = false;

  /**
   * Parse the envelope structure of a WhatsApp message to get the actual media container.
   */
  private static getRealMessage(message: any): any {
    if (!message) return null;
    if (message.ephemeralMessage) {
      return this.getRealMessage(message.ephemeralMessage.message);
    }
    if (message.viewOnceMessage) {
      return this.getRealMessage(message.viewOnceMessage.message);
    }
    if (message.viewOnceMessageV2) {
      return this.getRealMessage(message.viewOnceMessageV2.message);
    }
    if (message.documentWithCaptionMessage) {
      return this.getRealMessage(message.documentWithCaptionMessage.message);
    }
    return message;
  }

  private static startCleanupJob() {
    setInterval(async () => {
      if (!this.isInitialized) return;
      try {
        const activeIntegrations = await prisma.messengerIntegration.findMany({
          where: { provider: "whatsapp" },
          select: { sessionId: true },
        });
        const dbSessionIds = new Set(activeIntegrations.map((i) => i.sessionId).filter(Boolean));

        for (const sessionId of this.activeWaSessions.keys()) {
          if (!dbSessionIds.has(sessionId)) {
            console.log(`[Daemon Cleanup] Stopping orphaned WhatsApp session: ${sessionId}`);
            await this.stopWhatsAppSession(sessionId, false);
          }
        }
      } catch (_) {}
    }, 15000);
  }

  /**
   * Bootloader daemon. Runs on Next.js startup to initialize all active integrations.
   */
  static async initDaemon() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.startCleanupJob();

    console.log("[Daemon] Starting WhatsApp & Discord bot integrations...");

    try {
      // 1. Sync WhatsApp active sessions
      const folders = fs.readdirSync(storageDir);
      for (const id of folders) {
        const sessionPath = path.join(storageDir, id);
        if (fs.statSync(sessionPath).isDirectory()) {
          const credsPath = path.join(sessionPath, "creds.json");
          if (fs.existsSync(credsPath)) {
            console.log(`[Daemon] Auto-starting saved WhatsApp session: ${id}`);
            this.startWhatsAppSession(id).catch((err) => {
              console.error(`[Daemon] Failed to start WhatsApp session ${id}: ${err.message}`);
            });
          }
        }
      }

      // 2. Sync active Discord bots
      const activeBots = await prisma.messengerIntegration.findMany({
        where: { provider: "discord", status: "active", isActive: true },
      });

      for (const bot of activeBots) {
        try {
          const token = decrypt(bot.botTokenEncrypted);
          console.log(`[Daemon] Auto-starting Discord bot for: ${bot.integrationName}`);
          await this.startDiscordClient(bot.id, token);
        } catch (err: any) {
          console.error(`[Daemon] Failed to start Discord bot ${bot.id}: ${err.message}`);
        }
      }

    } catch (err: any) {
      console.error(`[Daemon] Initial sync error: ${err.message}`);
    }
  }

  private static writeSessionStatus(sessionId: string, status: string, qr: string | null) {
    try {
      const sessionDir = path.join(storageDir, sessionId);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(sessionDir, "status.json"),
        JSON.stringify({ status, qr, pid: process.pid, time: Date.now() }),
        "utf8"
      );
    } catch (_) {}
  }

  /**
   * Get connection status of a WhatsApp session.
   */
  static getWhatsAppStatus(sessionId: string) {
    const session = this.activeWaSessions.get(sessionId);
    if (session) {
      return { status: session.status, qr: session.qr };
    }

    // Try reading status from disk cache (shared across Next.js worker processes)
    try {
      const statusPath = path.join(storageDir, sessionId, "status.json");
      if (fs.existsSync(statusPath)) {
        const data = JSON.parse(fs.readFileSync(statusPath, "utf8"));
        if (data && (Date.now() - data.time < 30000 || data.status === "connected")) {
          return { status: data.status, qr: data.qr };
        }
      }
    } catch (_) {}

    return { status: "disconnected", qr: null };
  }

  /**
   * Initialize a new WhatsApp connection and handle connection loops.
   */
  static async startWhatsAppSession(sessionId: string) {
    if (this.activeWaSessions.has(sessionId)) {
      const active = this.activeWaSessions.get(sessionId);
      if (active?.status === "connected") return;
      await this.stopWhatsAppSession(sessionId, true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`[WhatsApp] Booting session: ${sessionId}`);
    this.activeWaSessions.set(sessionId, { sock: null, status: "connecting", qr: null });
    this.writeSessionStatus(sessionId, "connecting", null);

    const sessionDir = path.join(storageDir, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    let version = [2, 3000, 1015901307]; // fallback version
    try {
      const { version: latestVer } = await fetchLatestBaileysVersion();
      version = latestVer;
    } catch (_) {}

    const sock = makeWASocket({
      auth: state,
      logger: pinoLogger as any,
      printQRInTerminal: false,
      version: version as any,
      browser: ["Clospol Gateway", "Chrome", "1.0.0"],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    const currentSession = this.activeWaSessions.get(sessionId);
    if (currentSession) currentSession.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const s = this.activeWaSessions.get(sessionId);
      if (!s) return;

      if (qr) {
        s.status = "qr_ready";
        s.qr = await QRCode.toDataURL(qr);
        console.log(`[WhatsApp] QR generated for: ${sessionId}`);
        this.writeSessionStatus(sessionId, "qr_ready", s.qr);
      }

      if (connection === "open") {
        s.status = "connected";
        s.qr = null;
        console.log(`[WhatsApp] Session connected: ${sessionId}`);
        this.writeSessionStatus(sessionId, "connected", null);
        
        // Update SQLite state
        await prisma.messengerIntegration.updateMany({
          where: { sessionId },
          data: { status: "active", lastError: null },
        });
      }

      if (connection === "close") {
        const isActiveSocket = s.sock === sock;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Closed: ${sessionId}. Code: ${statusCode}, Reconnect: ${shouldReconnect && isActiveSocket}`);

        if (shouldReconnect && isActiveSocket) {
          s.status = "connecting";
          this.writeSessionStatus(sessionId, "connecting", null);
          const delay = statusCode === 515 ? 1000 : 5000;
          setTimeout(() => {
            if (this.activeWaSessions.get(sessionId)?.sock === sock) {
              this.startWhatsAppSession(sessionId);
            }
          }, delay);
        } else if (!shouldReconnect) {
          s.status = "disconnected";
          s.qr = null;
          this.writeSessionStatus(sessionId, "disconnected", null);
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (_) {}
          this.activeWaSessions.delete(sessionId);

          await prisma.messengerIntegration.updateMany({
            where: { sessionId },
            data: { status: "inactive" },
          });
        }
      }
    });

    // Listen for incoming message payloads
    sock.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify") return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const realMsg = this.getRealMessage(msg.message);
        if (!realMsg) continue;

        const messageType = Object.keys(realMsg)[0];
        const isMedia = ["imageMessage", "documentMessage", "videoMessage", "audioMessage"].includes(messageType);
        const isText = ["conversation", "extendedTextMessage"].includes(messageType);

        if (!isMedia && !isText) continue;

        try {
          // Fetch the related Integration profile to know user ID and name
          const integration = await prisma.messengerIntegration.findFirst({
            where: { sessionId, provider: "whatsapp" },
          });

          if (!integration) {
            throw new Error(`Integration profile not found for session: ${sessionId}`);
          }

          const chatJid = msg.key.remoteJid || "";
          const isGroup = chatJid.endsWith("@g.us");
          const chatType = isGroup ? "Groups" : "Personal";
          
          let chatName = chatJid.split("@")[0];
          if (isGroup) {
            try {
              const groupMetadata = await sock.groupMetadata(chatJid);
              chatName = groupMetadata.subject || chatName;
            } catch (_) {}
          } else {
            chatName = msg.pushName || chatName;
          }

          const senderName = msg.pushName || msg.key.participant?.split("@")[0] || chatJid.split("@")[0];

          if (isText) {
            let textContent = "";
            if (messageType === "conversation") {
              textContent = realMsg.conversation || "";
            } else if (messageType === "extendedTextMessage") {
              textContent = realMsg.extendedTextMessage?.text || "";
            }

            if (textContent.trim()) {
              const { sqlite } = require("@/db");
              sqlite.prepare(`
                INSERT INTO integration_messages (id, integration_id, user_id, sender_name, sender_avatar, chat_name, chat_type, message_type, content, media_url, media_size, mime_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                randomUUID(),
                integration.id,
                integration.userId,
                senderName,
                null,
                chatName,
                chatType,
                "text",
                textContent,
                null,
                0,
                "text/plain"
              );
            }
          } else if (isMedia) {
            console.log(`[WhatsApp] Downloading media attachment for session: ${sessionId}...`);
            const media = realMsg[messageType];
            const cleanMsg = { ...msg, message: realMsg };
            const buffer = await downloadMediaMessage(
              cleanMsg,
              "buffer",
              {},
              {
                logger: pinoLogger as any,
                reuploadRequest: sock.updateMediaMessage,
              }
            );

            if (!buffer || buffer.length === 0) {
              throw new Error("Empty media attachment buffer downloaded.");
            }

            // Resolve target storage destination
            const storageAccount = await UploadRoutingService.selectRoutingAccount(integration.userId, buffer.length);
            if (!storageAccount) {
              throw new Error("No active storage account resolved for bot upload.");
            }

            const mimeType = media.mimetype || "application/octet-stream";
            let fileName = media.fileName || "file";
            if (messageType === "imageMessage" && fileName === "file") {
              fileName = `image_${msg.key.id}.jpg`;
            } else if (messageType === "videoMessage" && fileName === "file") {
              fileName = `video_${msg.key.id}.mp4`;
            } else if (messageType === "audioMessage" && fileName === "file") {
              fileName = `audio_${msg.key.id}.mp3`;
            }

            // Resolve directory folder structure
            const folder = await MessengerFolderService.getOrCreateFolderPath(
              integration.userId,
              storageAccount,
              "whatsapp",
              integration.integrationName,
              chatType,
              chatName
            );

            // Stream upload to target storage
            const stream = Readable.from(buffer);
            const uploadedFile = await StorageUploaderService.uploadAndSaveFile(
              integration.userId,
              storageAccount,
              fileName,
              mimeType,
              buffer.length,
              folder.id,
              stream
            );

            // Save media record to integration_messages
            const { sqlite } = require("@/db");
            sqlite.prepare(`
              INSERT INTO integration_messages (id, integration_id, user_id, sender_name, sender_avatar, chat_name, chat_type, message_type, content, media_url, media_size, mime_type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              randomUUID(),
              integration.id,
              integration.userId,
              senderName,
              null,
              chatName,
              chatType,
              messageType.replace("Message", ""),
              fileName,
              `/api/files/${uploadedFile.id}/download?inline=true`,
              buffer.length,
              mimeType
            );

            console.log(`[WhatsApp] Media file routed successfully: ${fileName}`);
          }
        } catch (err: any) {
          console.error(`[WhatsApp] Failed to process incoming message: ${err.message}`);
        }
      }
    });
  }

  /**
   * Stop a WhatsApp socket session.
   */
  static async stopWhatsAppSession(sessionId: string, keepCredentials = false) {
    console.log(`[WhatsApp] Stopping session: ${sessionId}`);
    const s = this.activeWaSessions.get(sessionId);
    if (s) {
      this.activeWaSessions.delete(sessionId);
      if (s.sock) {
        try {
          if (s.status === "connected") {
            await s.sock.logout();
          }
        } catch (_) {}
        try {
          s.sock.end();
        } catch (_) {}
      }
    }
    this.writeSessionStatus(sessionId, "disconnected", null);

    if (!keepCredentials) {
      const sessionDir = path.join(storageDir, sessionId);
      if (fs.existsSync(sessionDir)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 800)); // wait for locks to release
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (err: any) {
          console.warn(`Failed to clean credentials directory: ${err.message}`);
        }
      }
    }

    await prisma.messengerIntegration.updateMany({
      where: { sessionId },
      data: { status: "inactive" },
    });
  }

  /**
   * Instantiate and connect to a Discord Bot token.
   */
  static async startDiscordClient(integrationId: string, token: string) {
    if (this.activeDiscordClients.has(integrationId)) {
      await this.stopDiscordClient(integrationId);
    }

    console.log(`[Discord] Authenticating client for integration: ${integrationId}`);

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    client.on("ready", () => {
      console.log(`[Discord] Bot logged in as ${client.user?.tag}`);
    });

    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;

      try {
        const integration = await prisma.messengerIntegration.findUnique({
          where: { id: integrationId },
        });

        if (!integration) throw new Error("Discord integration database entry deleted.");

        const chatType = message.guildId ? "Groups" : "Personal";
        const chatName = message.guild ? message.guild.name : message.author.username;
        const senderName = message.author.globalName || message.author.username;
        const senderAvatar = message.author.avatarURL() || null;

        // 1. Process text content if present
        if (message.content && message.content.trim()) {
          const { sqlite } = require("@/db");
          sqlite.prepare(`
            INSERT INTO integration_messages (id, integration_id, user_id, sender_name, sender_avatar, chat_name, chat_type, message_type, content, media_url, media_size, mime_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            randomUUID(),
            integration.id,
            integration.userId,
            senderName,
            senderAvatar,
            chatName,
            chatType,
            "text",
            message.content.trim(),
            null,
            0,
            "text/plain"
          );
        }

        // 2. Process attachments
        if (message.attachments.size > 0) {
          for (const [, attachment] of message.attachments) {
            try {
              console.log(`[Discord] Downloading attachment: ${attachment.name}...`);
              
              const res = await fetch(attachment.url);
              if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
              
              const arrayBuffer = await res.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Resolve target storage account
              const storageAccount = await UploadRoutingService.selectRoutingAccount(integration.userId, buffer.length);
              if (!storageAccount) throw new Error("No active storage account resolved for bot upload.");

              const mimeType = attachment.contentType || "application/octet-stream";
              const fileName = attachment.name || "file";

              // Resolve target virtual folder tree
              const folder = await MessengerFolderService.getOrCreateFolderPath(
                integration.userId,
                storageAccount,
                "discord",
                integration.integrationName,
                chatType,
                chatName
              );

              // Upload stream
              const stream = Readable.from(buffer);
              const uploadedFile = await StorageUploaderService.uploadAndSaveFile(
                integration.userId,
                storageAccount,
                fileName,
                mimeType,
                buffer.length,
                folder.id,
                stream
              );

              // Determine media type
              let msgType = "document";
              if (mimeType.startsWith("image/")) msgType = "image";
              else if (mimeType.startsWith("video/")) msgType = "video";
              else if (mimeType.startsWith("audio/")) msgType = "audio";

              // Save media message
              const { sqlite } = require("@/db");
              sqlite.prepare(`
                INSERT INTO integration_messages (id, integration_id, user_id, sender_name, sender_avatar, chat_name, chat_type, message_type, content, media_url, media_size, mime_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                randomUUID(),
                integration.id,
                integration.userId,
                senderName,
                senderAvatar,
                chatName,
                chatType,
                msgType,
                fileName,
                `/api/files/${uploadedFile.id}/download?inline=true`,
                buffer.length,
                mimeType
              );

              console.log(`[Discord] Attachment uploaded successfully: ${fileName}`);

            } catch (err: any) {
              console.error(`[Discord] Attachment error: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[Discord] messageCreate processing error: ${err.message}`);
      }
    });

    try {
      await client.login(token);
      this.activeDiscordClients.set(integrationId, client);
    } catch (err: any) {
      console.error(`[Discord] Bot login failed: ${err.message}`);
      await prisma.messengerIntegration.update({
        where: { id: integrationId },
        data: { lastError: `Discord Login Failed: ${err.message}` },
      });
      throw err;
    }
  }

  /**
   * Stop and log out a Discord Client.
   */
  static async stopDiscordClient(integrationId: string) {
    console.log(`[Discord] Stopping integration client: ${integrationId}`);
    const client = this.activeDiscordClients.get(integrationId);
    if (client) {
      try {
        client.destroy();
      } catch (_) {}
      this.activeDiscordClients.delete(integrationId);
    }

    await prisma.messengerIntegration.update({
      where: { id: integrationId },
      data: { status: "inactive" },
    });
  }
}
