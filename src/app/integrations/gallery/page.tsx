"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SidebarLayout from "@/components/layout/sidebar";

interface DBFile {
  id: string;
  userId: string;
  connectedAccountId: string;
  folderId: string | null;
  provider: string;
  providerFileId: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  checksum: string | null;
  status: string;
  isStarred: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GroupedFiles {
  dateLabel: string;
  dateKey: string;
  files: DBFile[];
}

export default function IntegrationsGalleryPage() {
  return (
    <Suspense fallback={
      <SidebarLayout>
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <div className="h-10 w-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-bold">Memuat Halaman...</p>
        </div>
      </SidebarLayout>
    }>
      <GalleryContent />
    </Suspense>
  );
}

function GalleryContent() {
  const searchParams = useSearchParams();
  const integrationId = searchParams.get("integrationId") || "";

  const [files, setFiles] = useState<DBFile[]>([]);
  const [activeIntegration, setActiveIntegration] = useState<{ id: string; provider: string; integrationName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "audio" | "document">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "size_desc" | "size_asc" | "name_asc" | "name_desc">("date_desc");
  const [toasts, setToasts] = useState<{ id: string; type: "success" | "error" | "info" | "warning"; message: string }[]>([]);

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Lightbox State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  
  // Dropdown States
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch Integration Files
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const url = integrationId 
        ? `/api/integrations/files?integrationId=${integrationId}`
        : "/api/integrations/files";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setActiveIntegration(data.integration || null);
      } else {
        console.error("Failed to load integrations files");
      }
    } catch (err) {
      console.error("Error fetching files:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [integrationId]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(target)) {
        setShowSortDropdown(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(target)) {
        setShowTypeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Format File Size
  const formatSize = (bytesStr: string) => {
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes) || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Get File Icons
  const getFileIconClass = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext)) return "fa-solid fa-file-image text-emerald-500";
    if (["mp4", "mkv", "mov", "avi", "webm"].includes(ext)) return "fa-solid fa-file-video text-amber-500";
    if (["mp3", "wav", "ogg", "flac"].includes(ext)) return "fa-solid fa-file-audio text-teal-500";
    if (["pdf"].includes(ext)) return "fa-solid fa-file-pdf text-rose-500";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "fa-solid fa-file-zipper text-purple-500";
    if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) return "fa-solid fa-file-lines text-blue-500";
    if (["xls", "xlsx", "csv"].includes(ext)) return "fa-solid fa-file-excel text-green-600";
    return "fa-solid fa-file text-slate-400";
  };

  // Friendly Date string
  const getFriendlyDate = (dateStr: string) => {
    const fileDate = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (fileDate.toDateString() === today.toDateString()) {
      return "Hari Ini";
    } else if (fileDate.toDateString() === yesterday.toDateString()) {
      return "Kemarin";
    } else {
      return fileDate.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  };

  // Filter & Sort
  const getFilteredAndSortedFiles = () => {
    let list = [...files];

    // Search Query
    if (searchQuery.trim() !== "") {
      list = list.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // Type Filter
    if (filterType !== "all") {
      list = list.filter((f) => {
        const mime = f.mimeType.toLowerCase();
        if (filterType === "image") return mime.startsWith("image/");
        if (filterType === "video") return mime.startsWith("video/");
        if (filterType === "audio") return mime.startsWith("audio/");
        if (filterType === "document") {
          return (
            mime.startsWith("text/") ||
            mime.includes("pdf") ||
            mime.includes("doc") ||
            mime.includes("xls") ||
            mime.includes("ppt") ||
            mime.includes("zip") ||
            mime.includes("json")
          );
        }
        return false;
      });
    }

    // Sorting
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();

      if (sortBy === "date_desc") return dateB - dateA;
      if (sortBy === "date_asc") return dateA - dateB;
      if (sortBy === "size_desc") return parseInt(b.sizeBytes, 10) - parseInt(a.sizeBytes, 10);
      if (sortBy === "size_asc") return parseInt(a.sizeBytes, 10) - parseInt(b.sizeBytes, 10);
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      return 0;
    });

    return list;
  };

  const filteredFilesList = getFilteredAndSortedFiles();

  // Grouping
  const getGroupedFiles = () => {
    const groupedMap = new Map<string, DBFile[]>();
    filteredFilesList.forEach((file) => {
      const d = new Date(file.createdAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!groupedMap.has(dateKey)) {
        groupedMap.set(dateKey, []);
      }
      groupedMap.get(dateKey)!.push(file);
    });

    const list: GroupedFiles[] = Array.from(groupedMap.entries()).map(([dateKey, filesList]) => ({
      dateKey,
      dateLabel: getFriendlyDate(dateKey),
      files: filesList,
    }));

    if (sortBy === "date_asc") {
      list.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    } else {
      list.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    }

    return list;
  };

  const groupedFiles = getGroupedFiles();

  // Toggle Favorite
  const handleToggleStar = async (file: DBFile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/files/${file.id}/star`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, isStarred: data.isStarred } : f))
        );
        showToast(
          data.isStarred ? `Menambahkan "${file.name}" ke Favorit` : `Menghapus "${file.name}" dari Favorit`,
          "success"
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete
  const handleDeleteFile = async (file: DBFile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (file.isStarred) {
      showToast("File favorit tidak dapat dihapus. Hapus bintang favorit terlebih dahulu.", "error");
      return;
    }
    if (!confirm(`Apakah Anda yakin ingin membuang "${file.name}" ke tempat sampah?`)) return;

    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        showToast(`Berhasil memindahkan "${file.name}" ke Tempat Sampah`, "success");
        
        if (lightboxIndex !== null) {
          if (filteredFilesList.length <= 1) {
            setLightboxIndex(null);
          } else {
            const nextIdx = lightboxIndex >= filteredFilesList.length - 1 ? lightboxIndex - 1 : lightboxIndex;
            setLightboxIndex(nextIdx);
          }
        }
      } else {
        const errData = await res.json();
        showToast(errData.error || "Gagal menghapus file", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadFile = (file: DBFile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.open(`/api/files/${file.id}/download`, "_blank");
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") handleNextLightbox();
      if (e.key === "ArrowLeft") handlePrevLightbox();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, filteredFilesList]);

  const handlePrevLightbox = () => {
    if (lightboxIndex === null || lightboxIndex === 0) return;
    setLightboxIndex(lightboxIndex - 1);
  };

  const handleNextLightbox = () => {
    if (lightboxIndex === null || lightboxIndex === filteredFilesList.length - 1) return;
    setLightboxIndex(lightboxIndex + 1);
  };

  const openLightboxForFile = (file: DBFile) => {
    const idx = filteredFilesList.findIndex((f) => f.id === file.id);
    if (idx !== -1) {
      setLightboxIndex(idx);
    }
  };

  const activeLightboxFile = lightboxIndex !== null ? filteredFilesList[lightboxIndex] : null;

  return (
    <SidebarLayout>
      <div className="space-y-6 animate-in fade-in duration-200">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/integrations"
                className="h-8 w-8 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                title="Kembali ke Integrasi"
              >
                <i className="fa-solid fa-arrow-left text-sm"></i>
              </Link>
              <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                {activeIntegration 
                  ? `Galeri: ${activeIntegration.integrationName}` 
                  : "Galeri Semua Integrasi"}
              </h1>
              {activeIntegration && (
                <span className={`rounded-xl px-2.5 py-0.5 text-[10px] font-black uppercase text-white tracking-wider bg-blue-600 shadow-sm shrink-0`}>
                  {activeIntegration.provider}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1 pl-10">
              {activeIntegration 
                ? `Lihat dan kelola file yang tersimpan dari integrasi ${activeIntegration.integrationName}`
                : "Lihat dan kelola semua file yang diunduh secara otomatis dari Telegram, WhatsApp, Discord, dan Slack"}
            </p>
          </div>
        </div>



        {/* Filtering & Controls Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-4.5">
          {/* Search Input */}
          <div className="relative w-full sm:max-w-xs">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input 
              type="text" 
              placeholder="Cari file galeri..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs glass-input"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end text-xs">
            
            {/* Sort Dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button 
                onClick={() => {
                  setShowSortDropdown(!showSortDropdown);
                  setShowTypeDropdown(false);
                }}
                className="flex h-8.5 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <i className="fa-solid fa-arrow-down-wide-short text-[10px]"></i>
                <span>Urutkan</span>
              </button>
              {showSortDropdown && (
                <div className="absolute right-0 z-40 mt-1.5 w-48 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  {[
                    { label: "Tanggal (Terbaru)", val: "date_desc" },
                    { label: "Tanggal (Terlama)", val: "date_asc" },
                    { label: "Ukuran (Terbesar)", val: "size_desc" },
                    { label: "Ukuran (Terkecil)", val: "size_asc" },
                    { label: "Nama (A-Z)", val: "name_asc" },
                    { label: "Nama (Z-A)", val: "name_desc" }
                  ].map(opt => (
                    <button 
                      key={opt.val} 
                      onClick={() => { setSortBy(opt.val as any); setShowSortDropdown(false); }} 
                      className={`flex w-full h-8 items-center justify-between rounded-lg px-3.5 font-bold transition text-left cursor-pointer ${
                        sortBy === opt.val 
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" 
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {sortBy === opt.val && <i className="fa-solid fa-check text-[10px]"></i>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Type Filter Dropdown */}
            <div className="relative" ref={typeDropdownRef}>
              <button 
                onClick={() => {
                  setShowTypeDropdown(!showTypeDropdown);
                  setShowSortDropdown(false);
                }}
                className={`flex h-8.5 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3.5 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                  filterType !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
                }`}
              >
                <span>Tipe</span>
                {filterType !== "all" && <span className="font-extrabold uppercase text-[9px]">: {filterType}</span>}
                <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
              </button>
              {showTypeDropdown && (
                <div className="absolute right-0 z-40 mt-1.5 w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  {[
                    { label: "Semua File", val: "all" },
                    { label: "Gambar (Foto)", val: "image" },
                    { label: "Video", val: "video" },
                    { label: "Audio", val: "audio" },
                    { label: "Dokumen / Arsip", val: "document" }
                  ].map(opt => (
                    <button 
                      key={opt.val} 
                      onClick={() => { setFilterType(opt.val as any); setShowTypeDropdown(false); }} 
                      className={`flex w-full h-8 items-center justify-between rounded-lg px-2.5 font-bold transition text-left cursor-pointer ${
                        filterType === opt.val ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button 
              onClick={fetchFiles}
              className="p-2 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
              title="Refresh"
            >
              <i className={`fa-solid fa-arrows-rotate ${loading ? "animate-spin" : ""}`}></i>
            </button>
          </div>
        </div>

        {/* Gallery Content Area */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-4">
            <div className="h-10 w-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Memuat galeri file...</p>
          </div>
        ) : filteredFilesList.length === 0 ? (
          <div className="py-24 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-6 space-y-3">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center text-2xl shadow-inner">
              <i className="fa-solid fa-images"></i>
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">Tidak Ada File Ditemukan</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
              Belum ada file yang cocok dengan kriteria filter atau belum ada file yang masuk dari integrasi chat Anda.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedFiles.map((group) => (
              <div key={group.dateKey} className="space-y-4">
                {/* Date Group Header */}
                <div className="sticky top-0 z-10 py-2 bg-slate-50 dark:bg-[#0b0f19] bg-opacity-90 backdrop-blur-md border-b border-slate-100 dark:border-slate-900/50 flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <i className="fa-regular fa-calendar-check text-blue-500"></i>
                    <span>{group.dateLabel}</span>
                  </h2>
                  <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200/30 dark:border-slate-800">
                    {group.files.length} file
                  </span>
                </div>

                {/* Google Photos Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                  {group.files.map((file) => {
                    const isImg = file.mimeType.toLowerCase().startsWith("image/");
                    const isVid = file.mimeType.toLowerCase().startsWith("video/");
                    
                    return (
                      <div 
                        key={file.id}
                        onClick={() => openLightboxForFile(file)}
                        className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/40 dark:border-slate-800/60 shadow-xs cursor-pointer hover:shadow-md hover:border-blue-500/40 transition-all duration-300"
                      >
                        {/* Media display or Doc icon */}
                        {isImg ? (
                          <img 
                            src={`/api/files/${file.id}/download?inline=true`} 
                            alt={file.name} 
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                          />
                        ) : isVid ? (
                          <div className="w-full h-full relative">
                            <video 
                              src={`/api/files/${file.id}/download?inline=true`} 
                              className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                              muted
                              loop
                              onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                              onMouseLeave={(e) => {
                                e.currentTarget.pause();
                                e.currentTarget.currentTime = 0;
                              }}
                            />
                            <div className="absolute bottom-2.5 right-2.5 h-6 w-6 rounded-full bg-slate-950/60 backdrop-blur-xs flex items-center justify-center text-[10px] text-white">
                              <i className="fa-solid fa-play"></i>
                            </div>
                          </div>
                        ) : (
                          // Non-media document card style
                          <div className="w-full h-full flex flex-col justify-between p-4.5 bg-slate-50/60 dark:bg-slate-950/20">
                            <div className="flex justify-between items-start">
                              <div className="h-10 w-10 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-xs">
                                <i className={`text-xl ${getFileIconClass(file.name)}`}></i>
                              </div>
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-slate-150/50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                {file.provider}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 line-clamp-2 leading-tight break-all">
                                {file.name}
                              </p>
                              <p className="text-[10px] text-slate-400 font-semibold">
                                {formatSize(file.sizeBytes)}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Top Provider badge overlay on photos */}
                        {(isImg || isVid) && (
                          <div className="absolute top-2.5 left-2.5 bg-slate-950/60 backdrop-blur-xs text-[9px] font-bold px-2 py-0.5 rounded-md text-white border border-white/10 opacity-80 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                            {file.provider}
                          </div>
                        )}

                        {/* Actions Quick Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
                          {/* Top row actions */}
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={(e) => handleToggleStar(file, e)}
                              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors border border-white/10 ${
                                file.isStarred 
                                  ? "bg-amber-500 text-white hover:bg-amber-600" 
                                  : "bg-slate-950/60 text-white hover:bg-slate-900/80"
                              }`}
                              title={file.isStarred ? "Hapus dari Favorit" : "Tambah ke Favorit"}
                            >
                              <i className={`text-xs ${file.isStarred ? "fa-solid fa-star" : "fa-regular fa-star"}`}></i>
                            </button>
                            <button
                              onClick={(e) => handleDownloadFile(file, e)}
                              className="h-7 w-7 rounded-lg bg-slate-950/60 hover:bg-slate-900/80 text-white flex items-center justify-center transition-colors border border-white/10"
                              title="Download File"
                            >
                              <i className="fa-solid fa-download text-xs"></i>
                            </button>
                            <button
                              onClick={(e) => handleDeleteFile(file, e)}
                              className="h-7 w-7 rounded-lg bg-slate-950/60 hover:bg-rose-600 text-white flex items-center justify-center transition-colors border border-white/10"
                              title="Hapus File"
                            >
                              <i className="fa-solid fa-trash-can text-xs"></i>
                            </button>
                          </div>

                          {/* Bottom info text (only for media files since documents already display it) */}
                          {(isImg || isVid) && (
                            <div className="text-white space-y-0.5">
                              <p className="text-[10px] font-bold truncate pr-6 text-slate-100">{file.name}</p>
                              <p className="text-[8px] font-semibold text-slate-300">{formatSize(file.sizeBytes)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal (Google Photos Style) */}
      {activeLightboxFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-200">
          
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900/40 border-b border-white/5 text-white">
            <div className="flex items-center gap-3.5 min-w-0">
              <button 
                onClick={() => setLightboxIndex(null)}
                className="h-9 w-9 rounded-xl hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
              >
                <i className="fa-solid fa-arrow-left text-sm"></i>
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate text-slate-100">{activeLightboxFile.name}</p>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{activeLightboxFile.provider} Storage</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleToggleStar(activeLightboxFile)}
                className={`h-9 w-9 rounded-xl flex items-center justify-center transition cursor-pointer ${
                  activeLightboxFile.isStarred ? "text-amber-400 hover:bg-amber-400/10" : "text-white/70 hover:bg-white/10"
                }`}
                title="Favoritkan"
              >
                <i className={`text-base ${activeLightboxFile.isStarred ? "fa-solid fa-star" : "fa-regular fa-star"}`}></i>
              </button>
              <button 
                onClick={() => handleDownloadFile(activeLightboxFile)}
                className="h-9 w-9 rounded-xl hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Download"
              >
                <i className="fa-solid fa-download text-base"></i>
              </button>
              <button 
                onClick={() => handleDeleteFile(activeLightboxFile)}
                className="h-9 w-9 rounded-xl hover:bg-rose-500/20 text-rose-400 hover:text-rose-350 flex items-center justify-center transition cursor-pointer"
                title="Hapus"
              >
                <i className="fa-solid fa-trash-can text-base"></i>
              </button>
              <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
              <button 
                onClick={() => setLightboxIndex(null)}
                className="h-9 w-9 rounded-xl hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Tutup"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
          </div>

          {/* Core Content Viewer with Navigation Controls */}
          <div className="flex-1 flex items-center justify-between px-4 relative">
            
            {/* Prev Button */}
            <button
              onClick={handlePrevLightbox}
              disabled={lightboxIndex === 0}
              className={`h-12 w-12 rounded-full flex items-center justify-center border border-white/5 transition-all text-white z-10 cursor-pointer ${
                lightboxIndex === 0
                  ? "opacity-10 pointer-events-none"
                  : "bg-white/5 hover:bg-white/10 hover:scale-105"
              }`}
            >
              <i className="fa-solid fa-chevron-left text-base"></i>
            </button>

            {/* Media Item Container */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
              {activeLightboxFile.mimeType.toLowerCase().startsWith("image/") ? (
                <img
                  src={`/api/files/${activeLightboxFile.id}/download?inline=true`}
                  alt={activeLightboxFile.name}
                  className="max-w-full max-h-[75vh] md:max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/5 select-text animate-in zoom-in-97 duration-300"
                />
              ) : activeLightboxFile.mimeType.toLowerCase().startsWith("video/") ? (
                <video
                  src={`/api/files/${activeLightboxFile.id}/download?inline=true`}
                  controls
                  autoPlay
                  className="max-w-full max-h-[75vh] md:max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/5 animate-in zoom-in-97 duration-300"
                />
              ) : (
                // Document fall-back in lightbox
                <div className="bg-slate-900 border border-white/5 rounded-3xl p-10 max-w-md w-full shadow-2xl text-center space-y-6 animate-in zoom-in-97 duration-300 text-white">
                  <div className="h-20 w-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl mx-auto">
                    <i className={getFileIconClass(activeLightboxFile.name)}></i>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-bold truncate px-2">{activeLightboxFile.name}</h3>
                    <p className="text-xs text-slate-400 font-semibold">{formatSize(activeLightboxFile.sizeBytes)}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{activeLightboxFile.mimeType}</p>
                  </div>
                  <button
                    onClick={() => handleDownloadFile(activeLightboxFile)}
                    className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
                  >
                    <i className="fa-solid fa-download mr-1.5"></i> Unduh File
                  </button>
                </div>
              )}
            </div>

            {/* Next Button */}
            <button
              onClick={handleNextLightbox}
              disabled={lightboxIndex === filteredFilesList.length - 1}
              className={`h-12 w-12 rounded-full flex items-center justify-center border border-white/5 transition-all text-white z-10 cursor-pointer ${
                lightboxIndex === filteredFilesList.length - 1
                  ? "opacity-10 pointer-events-none"
                  : "bg-white/5 hover:bg-white/10 hover:scale-105"
              }`}
            >
              <i className="fa-solid fa-chevron-right text-base"></i>
            </button>
          </div>

          {/* Bottom Info Bar */}
          <div className="px-6 py-5 bg-slate-900/40 border-t border-white/5 text-slate-400 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5">
                <i className="fa-regular fa-clock opacity-60"></i>
                <span className="font-semibold text-slate-350">Dibuat:</span>
                <span>
                  {new Date(activeLightboxFile.createdAt).toLocaleDateString("id-ID", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <i className="fa-solid fa-server opacity-60"></i>
                <span className="font-semibold text-slate-350">Ukuran:</span>
                <span>{formatSize(activeLightboxFile.sizeBytes)}</span>
              </div>
            </div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 border border-white/5 px-2.5 py-1 rounded-md self-start md:self-auto">
              Foto {lightboxIndex! + 1} dari {filteredFilesList.length}
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-[9999] space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-xl animate-in slide-in-from-right duration-300 ${
              toast.type === "success"
                ? "bg-white dark:bg-slate-900 border-emerald-100 dark:border-emerald-950/60 text-slate-800 dark:text-slate-200"
                : toast.type === "error"
                ? "bg-white dark:bg-slate-900 border-rose-100 dark:border-rose-950/60 text-slate-800 dark:text-slate-200"
                : toast.type === "warning"
                ? "bg-white dark:bg-slate-900 border-amber-100 dark:border-amber-950/60 text-slate-800 dark:text-slate-200"
                : "bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-950/60 text-slate-800 dark:text-slate-200"
            }`}
          >
            {/* Icon */}
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
              toast.type === "success"
                ? "bg-emerald-500/10 text-emerald-500"
                : toast.type === "error"
                ? "bg-rose-500/10 text-rose-500"
                : toast.type === "warning"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-blue-500/10 text-blue-500"
            }`}>
              {toast.type === "success" && <i className="fa-solid fa-circle-check text-xs"></i>}
              {toast.type === "error" && <i className="fa-solid fa-circle-exclamation text-xs"></i>}
              {toast.type === "warning" && <i className="fa-solid fa-triangle-exclamation text-xs"></i>}
              {toast.type === "info" && <i className="fa-solid fa-circle-info text-xs"></i>}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="text-xs font-black capitalize">
                {toast.type === "success" ? "Sukses" : toast.type === "error" ? "Error" : toast.type}
              </h4>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
                {toast.message}
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>
        ))}
      </div>
    </SidebarLayout>
  );
}
