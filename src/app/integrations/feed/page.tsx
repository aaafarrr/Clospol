"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  const [integrations, setIntegrations] = useState<{ id: string; name: string }[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState(initialIntegrationId);
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const toast = useToast();

  useEffect(() => {
    fetch("/api/integrations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setIntegrations(data.map((item: any) => ({ id: item.id, name: item.integrationName })));
        }
      })
      .catch((err) => console.error("Error fetching integrations:", err));
  }, []);

  const fetchMessages = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedIntegration) params.append("integrationId", selectedIntegration);
    if (selectedType !== "all") params.append("type", selectedType);
    if (searchQuery) params.append("query", searchQuery);

    fetch(`/api/integrations/messages?${params.toString()}`)
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
  }, [selectedIntegration, selectedType, searchQuery]);

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
      return date.toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return isoString;
    }
  };

  return (
    <SidebarLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white">
              Feed Pesan Masuk
            </h1>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
              Arsip percakapan dan media masuk dari integrasi WhatsApp dan Discord Anda.
            </p>
          </div>
          <Link
            href="/integrations"
            className="self-start md:self-auto h-9.5 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition flex items-center gap-1.5 cursor-pointer"
          >
            <i className="fa-solid fa-arrow-left"></i>
            Kembali ke Integrasi
          </Link>
        </div>

        {/* Filter Controls Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm">
          {/* Search bar */}
          <div className="relative md:col-span-2">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              type="text"
              placeholder="Cari pesan, pengirim, atau grup..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9.5 pr-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 focus:border-blue-500 dark:focus:border-blue-500 focus:outline-none transition"
            />
          </div>

          {/* Integration filter */}
          <div>
            <select
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-355 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="">Semua Integrasi</option>
              {integrations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          {/* Message Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-355 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800/80 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">Semua Tipe Pesan</option>
              <option value="text">Hanya Teks</option>
              <option value="image">Gambar / Foto</option>
              <option value="video">Video</option>
              <option value="audio">Voice Note / Audio</option>
              <option value="document">Dokumen / File</option>
            </select>
          </div>
        </div>

        {/* Feed Cards Section */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm">
            <div className="h-8 w-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-xs font-semibold text-slate-450">Memuat data feed...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm">
            <div className="h-16 w-16 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/50 dark:border-slate-850 flex items-center justify-center text-slate-400">
              <i className="fa-regular fa-message text-2xl"></i>
            </div>
            <div className="text-center">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Belum Ada Pesan</h3>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                Pesan atau media dari grup/personal belum masuk dari integrasi aktif Anda.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((item) => (
              <div 
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-4.5 shadow-sm space-y-3.5 hover:border-slate-300/80 dark:hover:border-slate-700/80 transition"
              >
                {/* Header: Sender & Meta */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {item.sender_avatar ? (
                      <img 
                        src={item.sender_avatar} 
                        alt={item.sender_name} 
                        className="h-9 w-9 rounded-xl object-cover shadow"
                      />
                    ) : (
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 shadow ${getAvatarBg(item.sender_name)}`}>
                        {getInitials(item.sender_name)}
                      </div>
                    )}

                    {/* Meta Names */}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 leading-none">
                          {item.sender_name}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/80 leading-none capitalize">
                          {item.chat_type === "Groups" ? `Group: ${item.chat_name}` : "Personal"}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 block mt-1">
                        {formatTime(item.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Integration Platform Badge */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 px-2 py-1 rounded-xl flex items-center gap-1">
                      {item.provider === "whatsapp" ? (
                        <i className="fa-brands fa-whatsapp text-emerald-500 text-xs"></i>
                      ) : (
                        <i className="fa-brands fa-discord text-blue-500 text-xs"></i>
                      )}
                      {item.integration_name}
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div className="pl-12 pr-2">
                  {/* Teks message */}
                  {item.message_type === "text" && (
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-355 leading-relaxed whitespace-pre-wrap">
                      {item.content}
                    </p>
                  )}

                  {/* Image attachment */}
                  {item.message_type === "image" && item.media_url && (
                    <div className="space-y-1.5">
                      <div 
                        onClick={() => setLightboxUrl(item.media_url)}
                        className="relative max-w-md rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-850 cursor-zoom-in group shadow"
                      >
                        <img 
                          src={item.media_url} 
                          alt={item.content || "Media"} 
                          className="max-h-80 w-auto object-cover rounded-2xl group-hover:scale-[1.02] transition duration-300"
                        />
                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <i className="fa-solid fa-expand text-white text-base"></i>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 block">
                        📂 {item.content} ({formatSize(item.media_size)})
                      </span>
                    </div>
                  )}

                  {/* Video attachment */}
                  {item.message_type === "video" && item.media_url && (
                    <div className="space-y-1.5">
                      <div className="max-w-md rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-850 bg-black shadow">
                        <video 
                          src={item.media_url} 
                          controls 
                          className="max-h-80 w-full rounded-2xl"
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 block">
                        🎥 {item.content} ({formatSize(item.media_size)})
                      </span>
                    </div>
                  )}

                  {/* Audio attachment */}
                  {item.message_type === "audio" && item.media_url && (
                    <div className="space-y-1.5 max-w-sm">
                      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm">
                        <div className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-microphone text-xs"></i>
                        </div>
                        <audio src={item.media_url} controls className="h-8 w-full max-w-xs" />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 block pl-1">
                        🎵 {item.content} ({formatSize(item.media_size)})
                      </span>
                    </div>
                  )}

                  {/* Document or other file attachments */}
                  {["document", "other"].includes(item.message_type) && item.media_url && (
                    <a
                      href={item.media_url}
                      download
                      className="flex items-center justify-between p-3.5 max-w-md bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/50 dark:hover:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl shadow-sm transition group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                          <i className="fa-regular fa-file-lines text-base"></i>
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate group-hover:text-blue-500 dark:group-hover:text-blue-400 transition">
                            {item.content}
                          </h4>
                          <span className="text-[10px] font-semibold text-slate-400 block mt-0.5">
                            {formatSize(item.media_size)}
                          </span>
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 text-slate-500 dark:text-slate-400 flex items-center justify-center shadow-sm shrink-0 group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-500 transition">
                        <i className="fa-solid fa-arrow-down text-xs"></i>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

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
