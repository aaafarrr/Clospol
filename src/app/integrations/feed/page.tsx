"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

interface MessageItem {
  id: string;
  integration_id: string;
  user_id: string;
  sender_name: string;
  sender_avatar: string | null;
  chat_name: string;
  chat_type: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_size: number;
  mime_type: string | null;
  created_at: string;
  integration_name: string;
  provider: string;
}

interface Conversation {
  chatKey: string; // chatName + "_" + integrationId
  chatName: string;
  chatType: string;
  provider: string;
  integrationName: string;
  integrationId: string;
  messages: MessageItem[];
  latestMessage: MessageItem;
}

export default function IntegrationsFeedPage() {
  return (
    <Suspense fallback={
      <SidebarLayout>
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <div className="h-10 w-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-bold">Memuat Feed...</p>
        </div>
      </SidebarLayout>
    }>
      <FeedContent />
    </Suspense>
  );
}

function FeedContent() {
  const searchParams = useSearchParams();
  const initialIntegrationId = searchParams.get("integrationId") || "";

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatKey, setActiveChatKey] = useState<string | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [messageFilterTab, setMessageFilterTab] = useState<"all" | "files" | "links">("all");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const toast = useToast();

  const fetchMessages = () => {
    setLoading(true);
    fetch(`/api/integrations/messages`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          setMessages([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching messages:", err);
        toast.toast("Gagal memuat feed pesan", "error");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  // Detect URL patterns
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  const hasLinks = (msg: MessageItem) => {
    if (msg.message_type !== "text") return false;
    return urlRegex.test(msg.content || "");
  };

  // Group messages into Conversations
  const conversations = useMemo(() => {
    const groups: Record<string, Conversation> = {};

    messages.forEach((msg) => {
      const chatKey = `${msg.chat_name}_${msg.integration_id}`;
      if (!groups[chatKey]) {
        groups[chatKey] = {
          chatKey,
          chatName: msg.chat_name,
          chatType: msg.chat_type,
          provider: msg.provider,
          integrationName: msg.integration_name,
          integrationId: msg.integration_id,
          messages: [],
          latestMessage: msg,
        };
      }
      groups[chatKey].messages.push(msg);
    });

    // Sort by latest message timestamp descending
    return Object.values(groups).sort(
      (a, b) => new Date(b.latestMessage.created_at).getTime() - new Date(a.latestMessage.created_at).getTime()
    );
  }, [messages]);

  // Filter conversations by left sidebar search query
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) =>
      c.chatName.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
      c.integrationName.toLowerCase().includes(chatSearchQuery.toLowerCase())
    );
  }, [conversations, chatSearchQuery]);

  // Find currently active conversation
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.chatKey === activeChatKey) || null;
  }, [conversations, activeChatKey]);

  // Filter messages in current chat room by top filter tabs
  const activeChatMessages = useMemo(() => {
    if (!activeConversation) return [];
    
    // Message list needs to be chronological (oldest to newest) inside the room
    const chronologicalMessages = [...activeConversation.messages].reverse();

    if (messageFilterTab === "files") {
      return chronologicalMessages.filter((m) => m.message_type !== "text");
    }
    if (messageFilterTab === "links") {
      return chronologicalMessages.filter((m) => hasLinks(m));
    }
    return chronologicalMessages;
  }, [activeConversation, messageFilterTab]);

  const getInitials = (name: string) => {
    return name ? name.substring(0, 2).toUpperCase() : "M";
  };

  const getAvatarBg = (name: string) => {
    const colors = [
      "bg-blue-500", "bg-purple-500", "bg-emerald-500", 
      "bg-amber-500", "bg-rose-500", "bg-indigo-500", 
      "bg-teal-500", "bg-violet-500"
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString.replace(" ", "T"));
      return date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return "";
    }
  };

  const formatFullDate = (isoString: string) => {
    try {
      const date = new Date(isoString.replace(" ", "T"));
      return date.toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch (_) {
      return isoString;
    }
  };

  // Helper to parse URLs inside text messages into clickable links
  const renderTextContent = (text: string) => {
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        const url = part.startsWith("www.") ? `https://${part}` : part;
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline break-all font-bold"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white">
              Arsip Chat Hub
            </h1>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              WhatsApp & Discord conversation streams merged in real-time layout.
            </p>
          </div>
          <Link
            href="/integrations"
            className="self-start sm:self-auto h-9 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-arrow-left"></i>
            Kembali
          </Link>
        </div>

        {/* Outer Split Layout Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl overflow-hidden shadow-sm h-[calc(100vh-190px)] min-h-[500px]">
          
          {/* 1. Left Sidebar: Chat List */}
          <div className="lg:col-span-4 border-r border-slate-200/60 dark:border-slate-800/80 flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/20">
            {/* Search Bar */}
            <div className="p-4 border-b border-slate-200/60 dark:border-slate-800/80 shrink-0">
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 text-[11px]"></i>
                <input
                  type="text"
                  placeholder="Cari chat atau grup..."
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9.5 pr-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-2.5">
                  <div className="h-6 w-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="text-[10px] font-semibold text-slate-450">Memuat chat room...</p>
                </div>
              ) : filteredConversations.length === 0 ? (
                <p className="text-center text-xs font-bold text-slate-400 py-10">
                  {chatSearchQuery ? "Tidak ada chat yang cocok" : "Belum ada riwayat chat"}
                </p>
              ) : (
                filteredConversations.map((item) => {
                  const isActive = item.chatKey === activeChatKey;
                  return (
                    <button
                      key={item.chatKey}
                      onClick={() => {
                        setActiveChatKey(item.chatKey);
                        setMessageFilterTab("all");
                      }}
                      className={`w-full p-3.5 text-left transition flex gap-3 focus:outline-none hover:bg-slate-100/50 dark:hover:bg-slate-900/50 ${
                        isActive ? "bg-blue-50/40 dark:bg-blue-950/15 border-l-4 border-blue-500 pl-[10px]" : ""
                      }`}
                    >
                      {/* Avatar initials badge */}
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm ${getAvatarBg(item.chatName)}`}>
                        {getInitials(item.chatName)}
                      </div>

                      {/* Room metadata */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {item.chatName}
                          </h4>
                          <span className="text-[9px] font-semibold text-slate-400 shrink-0">
                            {formatTime(item.latestMessage.created_at)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="text-[10px] text-slate-500 dark:text-slate-450 truncate flex-1 leading-snug">
                            {item.latestMessage.message_type === "text" 
                              ? item.latestMessage.content 
                              : `[${item.latestMessage.message_type.toUpperCase()}] ${item.latestMessage.content}`}
                          </p>
                          
                          {/* Channel Platform Badge */}
                          <span className="text-[8px] font-bold text-slate-400 flex items-center gap-0.5 shrink-0 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {item.provider === "whatsapp" ? (
                              <i className="fa-brands fa-whatsapp text-emerald-500"></i>
                            ) : (
                              <i className="fa-brands fa-discord text-blue-500"></i>
                            )}
                            {item.integrationName}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Right Detail: Chat Thread */}
          <div className="lg:col-span-8 flex flex-col h-full bg-slate-50/20 dark:bg-slate-900/10">
            {activeConversation ? (
              <>
                {/* Chat Room Header */}
                <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                      {activeConversation.chatName}
                    </h3>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                      Integrasi: <span className="capitalize">{activeConversation.provider}</span> ({activeConversation.integrationName}) &bull; {activeConversation.messages.length} Pesan
                    </p>
                  </div>

                  {/* Filter Tabs inside Chat (All / Media / Links) */}
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5.5 rounded-xl self-start sm:self-center shrink-0">
                    <button
                      onClick={() => setMessageFilterTab("all")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        messageFilterTab === "all"
                          ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setMessageFilterTab("files")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        messageFilterTab === "files"
                          ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Media & File
                    </button>
                    <button
                      onClick={() => setMessageFilterTab("links")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        messageFilterTab === "links"
                          ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      Tautan
                    </button>
                  </div>
                </div>

                {/* Message Bubble Feed Area */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-100/40 dark:bg-slate-950/10">
                  {activeChatMessages.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400 dark:text-slate-650">
                      <i className="fa-regular fa-folder-open text-2xl"></i>
                      <p className="text-xs font-bold mt-2">
                        Tidak ada pesan dengan filter "{messageFilterTab}"
                      </p>
                    </div>
                  ) : (
                    activeChatMessages.map((msg, index) => {
                      // Check if we should render a Date header (for new dates)
                      const prevMsg = activeChatMessages[index - 1];
                      const showDateHeader = !prevMsg || 
                        formatFullDate(prevMsg.created_at) !== formatFullDate(msg.created_at);

                      return (
                        <div key={msg.id} className="space-y-3">
                          {showDateHeader && (
                            <div className="flex justify-center my-4 shrink-0">
                              <span className="bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                {formatFullDate(msg.created_at)}
                              </span>
                            </div>
                          )}

                          {/* Message Bubble Container (Incoming-styled Left bubbles) */}
                          <div className="flex items-start gap-2.5 max-w-xl group">
                            {/* Initials Circle */}
                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-sm ${getAvatarBg(msg.sender_name)}`}>
                              {getInitials(msg.sender_name)}
                            </div>

                            {/* Message Bubble */}
                            <div className="flex flex-col space-y-1">
                              <div className="bg-white dark:bg-slate-950 border border-slate-200/50 dark:border-slate-850 px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-sm relative space-y-1.5">
                                {/* Sender name inside group chat */}
                                <span className="text-[10px] font-black text-blue-500 block leading-none">
                                  {msg.sender_name}
                                </span>

                                {/* Message body content */}
                                <div className="text-[11.5px] leading-relaxed">
                                  {msg.message_type === "text" && (
                                    <p className="text-slate-700 dark:text-slate-300 font-semibold whitespace-pre-wrap">
                                      {renderTextContent(msg.content || "")}
                                    </p>
                                  )}

                                  {msg.message_type === "image" && msg.media_url && (
                                    <div className="space-y-1">
                                      <div
                                        onClick={() => setLightboxUrl(msg.media_url)}
                                        className="relative rounded-xl overflow-hidden border border-slate-100 dark:border-slate-900 cursor-zoom-in group shadow-sm bg-slate-50 max-h-60"
                                      >
                                        <img
                                          src={msg.media_url}
                                          alt={msg.content || "Media"}
                                          className="max-h-60 w-auto object-cover group-hover:scale-[1.01] transition"
                                        />
                                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                          <i className="fa-solid fa-expand text-white text-xs"></i>
                                        </div>
                                      </div>
                                      <span className="text-[9px] font-semibold text-slate-400 block truncate">
                                        📁 {msg.content} ({formatSize(msg.media_size)})
                                      </span>
                                    </div>
                                  )}

                                  {msg.message_type === "video" && msg.media_url && (
                                    <div className="space-y-1">
                                      <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-900 bg-black max-w-sm">
                                        <video
                                          src={msg.media_url}
                                          controls
                                          className="max-h-60 w-full"
                                        />
                                      </div>
                                      <span className="text-[9px] font-semibold text-slate-400 block">
                                        🎥 {msg.content} ({formatSize(msg.media_size)})
                                      </span>
                                    </div>
                                  )}

                                  {msg.message_type === "audio" && msg.media_url && (
                                    <div className="space-y-1 max-w-xs">
                                      <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 rounded-xl">
                                        <div className="h-6 w-6 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                                          <i className="fa-solid fa-microphone text-[10px]"></i>
                                        </div>
                                        <audio src={msg.media_url} controls className="h-6 w-full max-w-[200px]" />
                                      </div>
                                      <span className="text-[9px] font-semibold text-slate-400 block pl-1">
                                        🎵 {msg.content} ({formatSize(msg.media_size)})
                                      </span>
                                    </div>
                                  )}

                                  {["document", "other"].includes(msg.message_type) && msg.media_url && (
                                    <a
                                      href={msg.media_url}
                                      download
                                      className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100/50 dark:hover:bg-slate-850 border border-slate-200/50 dark:border-slate-800 rounded-xl transition group/doc cursor-pointer max-w-xs"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                                          <i className="fa-regular fa-file-lines text-sm"></i>
                                        </div>
                                        <div className="min-w-0">
                                          <h4 className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate group-hover/doc:text-blue-500 transition">
                                            {msg.content}
                                          </h4>
                                          <span className="text-[8px] font-semibold text-slate-450 block mt-0.5">
                                            {formatSize(msg.media_size)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="h-6 w-6 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-850 text-slate-500 flex items-center justify-center shrink-0 shadow-sm group-hover/doc:bg-blue-500 group-hover/doc:text-white group-hover/doc:border-blue-500 transition">
                                        <i className="fa-solid fa-arrow-down text-[10px]"></i>
                                      </div>
                                    </a>
                                  )}
                                </div>

                                {/* Bubble Footer Timestamp */}
                                <div className="text-[9px] font-semibold text-slate-400 flex justify-end">
                                  {formatTime(msg.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              // Empty State Splash Screen (No Chat Selected)
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-blue-500/5 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/10">
                  <i className="fa-regular fa-comments text-4xl"></i>
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                    Clospol Chat Hub
                  </h3>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                    Pilih salah satu ruang chat di panel sebelah kiri untuk menampilkan riwayat percakapan dan arsip file media.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div 
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 bg-black/85 z-[99999] flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-300"
        >
          <button 
            onClick={() => setLightboxUrl(null)}
            className="absolute top-5 right-5 h-10 w-10 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full flex items-center justify-center text-white transition cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
          <img 
            src={lightboxUrl} 
            alt="Enlarged" 
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg animate-in zoom-in-95 duration-300"
          />
        </div>
      )}
    </SidebarLayout>
  );
}
