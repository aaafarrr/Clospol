import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { UploadRoutingService } from "@/services/storage/routing";
import { MessengerFolderService } from "@/services/messenger/folder";
import { StorageUploaderService } from "@/services/storage/uploader";

// 1. GET handler for Webhook Verification (WhatsApp Official challenge verification)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      const integration = await prisma.messengerIntegration.findUnique({
        where: { id },
      });

      if (!integration) {
        return new NextResponse("Integration not found", { status: 404 });
      }

      // Decrypt composite token (phoneNumberId:accessToken:verifyToken)
      const decrypted = decrypt(integration.botTokenEncrypted);
      const parts = decrypted.split(":");
      const dbVerifyToken = parts[2] || parts[0]; // fallback if verifyToken is not formatted correctly

      if (token === dbVerifyToken) {
        console.log(`[Webhook] WhatsApp Official verification successful for integration: ${id}`);
        return new NextResponse(challenge, { status: 200 });
      } else {
        return new NextResponse("Verification token mismatch", { status: 403 });
      }
    }

    return new NextResponse("Invalid request", { status: 400 });
  } catch (err: any) {
    console.error("GET webhook verify error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// 2. POST handler for incoming events (Telegram, Slack, and WhatsApp Official)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const integration = await prisma.messengerIntegration.findUnique({
      where: { id },
    });

    if (!integration) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    if (!integration.isActive) {
      return NextResponse.json({ error: "Integration is disabled" }, { status: 400 });
    }

    const body = await req.json();

    // Decrypt credentials
    const decryptedToken = decrypt(integration.botTokenEncrypted);

    // --- CASE A: SLACK EVENT API ---
    if (integration.provider === "slack") {
      // 1. Slack URL Verification Challenge
      if (body.type === "url_verification") {
        return NextResponse.json({ challenge: body.challenge });
      }

      // 2. Message Event handling
      if (body.event && body.event.type === "message" && !body.event.bot_id) {
        const event = body.event;
        if (event.files && event.files.length > 0) {
          console.log(`[Slack Webhook] Processing ${event.files.length} attachment(s) for integration: ${id}`);
          
          for (const file of event.files) {
            try {
              // Download private file from Slack
              const downloadRes = await fetch(file.url_private, {
                headers: {
                  Authorization: `Bearer ${decryptedToken}`,
                },
              });
              if (!downloadRes.ok) throw new Error(`Slack download failed with status ${downloadRes.status}`);

              const arrayBuffer = await downloadRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Select storage
              const storageAccount = await UploadRoutingService.selectRoutingAccount(integration.userId, buffer.length);
              if (!storageAccount) throw new Error("No active storage account resolved.");

              const chatType = "Groups"; // Slack channels are treated as group folders
              const chatName = event.channel || "general";

              const folder = await MessengerFolderService.getOrCreateFolderPath(
                integration.userId,
                storageAccount,
                "slack",
                integration.integrationName,
                chatType,
                chatName
              );

              const stream = Readable.from(buffer);
              await StorageUploaderService.uploadAndSaveFile(
                integration.userId,
                storageAccount,
                file.name || "slack_file",
                file.mimetype || "application/octet-stream",
                buffer.length,
                folder.id,
                stream
              );
            } catch (err: any) {
              console.error(`[Slack Webhook] Error downloading/saving file: ${err.message}`);
            }
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // --- CASE B: TELEGRAM BOT API ---
    if (integration.provider === "telegram") {
      const message = body.message || body.edited_message;
      if (message) {
        // Detect document, photo, video, or voice/audio
        let fileId: string | null = null;
        let fileName = "telegram_file";
        let mimeType = "application/octet-stream";

        if (message.document) {
          fileId = message.document.file_id;
          fileName = message.document.file_name || fileName;
          mimeType = message.document.mime_type || mimeType;
        } else if (message.photo && message.photo.length > 0) {
          // Photo is an array of sizes, pick the last/largest one
          const photo = message.photo[message.photo.length - 1];
          fileId = photo.file_id;
          fileName = `photo_${message.message_id}.jpg`;
          mimeType = "image/jpeg";
        } else if (message.video) {
          fileId = message.video.file_id;
          fileName = `video_${message.message_id}.mp4`;
          mimeType = message.video.mime_type || "video/mp4";
        } else if (message.audio) {
          fileId = message.audio.file_id;
          fileName = message.audio.file_name || `audio_${message.message_id}.mp3`;
          mimeType = message.audio.mime_type || "audio/mpeg";
        } else if (message.voice) {
          fileId = message.voice.file_id;
          fileName = `voice_${message.message_id}.ogg`;
          mimeType = message.voice.mime_type || "audio/ogg";
        }

        if (fileId) {
          console.log(`[Telegram Webhook] Retrieving file info for file_id: ${fileId}`);
          try {
            // Get file path from Telegram
            const infoRes = await fetch(`https://api.telegram.org/bot${decryptedToken}/getFile?file_id=${fileId}`);
            if (!infoRes.ok) throw new Error(`Telegram getFile info failed with status ${infoRes.status}`);

            const infoData = await infoRes.json() as any;
            if (infoData.ok && infoData.result?.file_path) {
              const filePath = infoData.result.file_path;

              // Download file binary
              const downloadRes = await fetch(`https://api.telegram.org/file/bot${decryptedToken}/${filePath}`);
              if (!downloadRes.ok) throw new Error(`Telegram file download failed with status ${downloadRes.status}`);

              const arrayBuffer = await downloadRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Select storage
              const storageAccount = await UploadRoutingService.selectRoutingAccount(integration.userId, buffer.length);
              if (!storageAccount) throw new Error("No active storage account resolved.");

              const chatType = message.chat?.type === "private" ? "Personal" : "Groups";
              const chatName = message.chat?.title || message.chat?.username || message.chat?.first_name || "unknown";

              const folder = await MessengerFolderService.getOrCreateFolderPath(
                integration.userId,
                storageAccount,
                "telegram",
                integration.integrationName,
                chatType,
                chatName
              );

              const stream = Readable.from(buffer);
              await StorageUploaderService.uploadAndSaveFile(
                integration.userId,
                storageAccount,
                fileName,
                mimeType,
                buffer.length,
                folder.id,
                stream
              );
              console.log(`[Telegram Webhook] File saved successfully: ${fileName}`);
            }
          } catch (err: any) {
            console.error(`[Telegram Webhook] Error fetching/saving file: ${err.message}`);
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // --- CASE C: WHATSAPP OFFICIAL API ---
    if (integration.provider === "whatsapp_official") {
      const parts = decryptedToken.split(":");
      const accessToken = parts[1];

      if (body.entry && body.entry.length > 0) {
        for (const entry of body.entry) {
          if (entry.changes && entry.changes.length > 0) {
            for (const change of entry.changes) {
              if (change.value?.messages && change.value.messages.length > 0) {
                for (const msg of change.value.messages) {
                  const messageType = msg.type;
                  const isMedia = ["image", "video", "audio", "document", "voice"].includes(messageType);
                  
                  if (isMedia) {
                    const media = msg[messageType];
                    const mediaId = media.id;

                    console.log(`[WA Official Webhook] Found media attachment: ${mediaId} (Type: ${messageType})`);
                    try {
                      // Fetch WhatsApp Cloud Media URL details
                      const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                        },
                      });
                      if (!metaRes.ok) throw new Error(`WA Media info fetch failed with status ${metaRes.status}`);

                      const metaData = await metaRes.json() as any;
                      if (metaData.url) {
                        // Download media binary from Meta Graph URL
                        const downloadRes = await fetch(metaData.url, {
                          headers: {
                            Authorization: `Bearer ${accessToken}`,
                          },
                        });
                        if (!downloadRes.ok) throw new Error(`WA Media download failed with status ${downloadRes.status}`);

                        const arrayBuffer = await downloadRes.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);

                        // Select storage
                        const storageAccount = await UploadRoutingService.selectRoutingAccount(integration.userId, buffer.length);
                        if (!storageAccount) throw new Error("No active storage account resolved.");

                        const senderName = change.value.contacts?.[0]?.profile?.name || msg.from || "unknown";
                        const chatType = "Personal"; // WhatsApp cloud API webhooks generally arrive in personal contexts
                        const chatName = senderName;

                        const folder = await MessengerFolderService.getOrCreateFolderPath(
                          integration.userId,
                          storageAccount,
                          "whatsapp_official",
                          integration.integrationName,
                          chatType,
                          chatName
                        );

                        let fileName = media.filename || "file";
                        if (messageType === "image" && fileName === "file") fileName = `image_${mediaId}.jpg`;
                        else if (messageType === "video" && fileName === "file") fileName = `video_${mediaId}.mp4`;
                        else if (messageType === "audio" && fileName === "file") fileName = `audio_${mediaId}.mp3`;
                        else if (messageType === "voice" && fileName === "file") fileName = `voice_${mediaId}.ogg`;

                        const stream = Readable.from(buffer);
                        await StorageUploaderService.uploadAndSaveFile(
                          integration.userId,
                          storageAccount,
                          fileName,
                          metaData.mime_type || "application/octet-stream",
                          buffer.length,
                          folder.id,
                          stream
                        );
                        console.log(`[WA Official Webhook] Media saved: ${fileName}`);
                      }
                    } catch (err: any) {
                      console.error(`[WA Official Webhook] Error downloading/saving media: ${err.message}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ error: "Unsupported provider type" }, { status: 400 });
  } catch (err: any) {
    console.error("POST messenger webhook error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
