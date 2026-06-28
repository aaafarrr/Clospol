"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";

interface ShareItem {
  id: string;
  fileId: string | null;
  folderId: string | null;
  isFolder: boolean;
  fileName: string;
  fileSize: string;
  mimeType: string;
  token: string;
  url: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
}

export default function SharedPage() {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"files" | "folders">("files");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/files/shared-links");
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
      }
    } catch (err) {
      console.error("Error loading shared links:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url)
      .then(() => {
        setAlertMessage("Public share URL copied to clipboard.");
      })
      .catch((err) => {
        console.error("Could not copy link:", err);
      });
  };

  const revokeShare = async (share: ShareItem) => {
    const typeLabel = share.isFolder ? "folder" : "file";
    if (!confirm(`Are you sure you want to disable public access to this ${typeLabel}? Current links will break.`)) return;
    
    try {
      const url = share.isFolder 
        ? `/api/folders/${share.folderId}/share`
        : `/api/files/${share.fileId}/share`;

      const res = await fetch(url, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertMessage(`Public share link for this ${typeLabel} revoked.`);
        loadData();
      } else {
        alert("Failed to revoke share link.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getFileExtension = (name: string) => {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()?.substring(0, 4) : "file";
  };

  const formatBytes = (bytesStr: string) => {
    const parsed = parseInt(bytesStr);
    if (isNaN(parsed) || parsed === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(parsed) / Math.log(k));
    return parseFloat((parsed / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIconClass = (name: string, isFolder: boolean) => {
    if (isFolder) return "fa-folder-closed text-blue-500 dark:text-blue-400";
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf":
        return "fa-file-pdf text-red-500";
      case "doc":
      case "docx":
        return "fa-file-word text-blue-500";
      case "xls":
      case "xlsx":
        return "fa-file-excel text-emerald-500";
      case "ppt":
      case "pptx":
        return "fa-file-powerpoint text-orange-500";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "webp":
      case "svg":
        return "fa-file-image text-teal-500";
      case "mp4":
      case "mov":
      case "avi":
      case "mkv":
        return "fa-file-video text-violet-500";
      case "zip":
      case "rar":
      case "tar":
      case "gz":
      case "7z":
        return "fa-file-zipper text-amber-500";
      default:
        return "fa-file-lines text-slate-400";
    }
  };

  const sharedFiles = shares.filter(s => !s.isFolder);
  const sharedFolders = shares.filter(s => s.isFolder);

  return (
    <SidebarLayout>
      <div className="relative space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Public Share Links</h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
              Manage your generated public files and folders share links, configure password protection, or revoke access.
            </p>
          </div>
        </div>

        {/* Alert Banner */}
        {alertMessage && (
          <div className="rounded-2xl bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50 p-4 text-sm font-bold text-blue-700 dark:text-blue-400 flex items-center justify-between animate-in fade-in duration-200">
            <span>{alertMessage}</span>
            <button 
              onClick={() => setAlertMessage(null)} 
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
          <button 
            onClick={() => setActiveTab("files")}
            className={`pb-4 text-sm font-bold border-b-2 transition-all relative flex items-center gap-2 cursor-pointer ${
              activeTab === "files" 
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400" 
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            <span>Shared Files</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === "files" 
                ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" 
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              {sharedFiles.length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab("folders")}
            className={`pb-4 text-sm font-bold border-b-2 transition-all relative flex items-center gap-2 cursor-pointer ${
              activeTab === "folders" 
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400" 
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
            }`}
          >
            <span>Shared Folders</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === "folders" 
                ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400" 
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              {sharedFolders.length}
            </span>
          </button>
        </div>

        {/* Loader */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4 shadow-sm animate-pulse space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
                  <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded"></div>
                </div>
                <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {/* Tab: Shared Files */}
            {activeTab === "files" && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {sharedFiles.length === 0 ? (
                  <div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 mb-3">
                      <i className="fa-solid fa-link text-xl"></i>
                    </div>
                    <p className="text-base font-bold text-slate-700 dark:text-slate-300">No public shared files</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
                      Generate public share links for your files from the "All Files" menu actions.
                    </p>
                  </div>
                ) : (
                  sharedFiles.map((share) => (
                    <div 
                      key={share.id} 
                      className="group relative flex flex-col justify-between border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500/50 bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-inner group-hover:scale-105 transition-transform duration-200">
                              <i className={`fa-solid ${getFileIconClass(share.fileName, false)} text-lg`}></i>
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                                {share.fileName}
                              </h3>
                              <span className="inline-block mt-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-teal-50 border border-teal-100 text-teal-600 dark:bg-teal-950/50 dark:border-teal-900/50 dark:text-teal-400">
                                {getFileExtension(share.fileName)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                          <p>Size: <span className="text-slate-600 dark:text-slate-300 font-bold">{formatBytes(share.fileSize)}</span></p>
                          <p>Downloads: <span className="text-slate-600 dark:text-slate-300 font-bold">{share.downloadCount}</span></p>
                          <p>Expires: <span className="text-slate-600 dark:text-slate-300 font-bold">{share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : "Never"}</span></p>
                        </div>

                        {/* Public Link Input Widget */}
                        <div className="flex items-center gap-1.5 mt-4">
                          <input 
                            type="text" 
                            value={share.url} 
                            readOnly 
                            className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[10px] font-mono text-slate-500 dark:text-slate-400 focus:outline-none"
                          />
                          <button 
                            onClick={() => copyLink(share.url)} 
                            className="h-9 px-3 bg-slate-800 dark:bg-slate-700 hover:bg-slate-950 dark:hover:bg-slate-600 text-white rounded-xl text-[10px] font-bold transition cursor-pointer"
                          >
                            Copy
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 flex gap-2">
                        <button 
                          onClick={() => revokeShare(share)} 
                          className="flex-1 h-9 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-950 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          <i className="fa-solid fa-trash-can"></i>
                          Disable Link
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Shared Folders */}
            {activeTab === "folders" && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {sharedFolders.length === 0 ? (
                  <div className="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 mb-3">
                      <i className="fa-solid fa-folder-open text-xl"></i>
                    </div>
                    <p className="text-base font-bold text-slate-700 dark:text-slate-300">No public shared folders</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
                      Generate public share links for your folders from the "All Files" menu actions.
                    </p>
                  </div>
                ) : (
                  sharedFolders.map((share) => (
                    <div 
                      key={share.id} 
                      className="group relative flex flex-col justify-between border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500/50 bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 shadow-inner group-hover:scale-105 transition-transform duration-200">
                              <i className={`fa-solid ${getFileIconClass(share.fileName, true)} text-lg`}></i>
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate font-bold text-sm text-slate-800 dark:text-slate-200 leading-tight">
                                {share.fileName}
                              </h3>
                              <span className="inline-block mt-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-600 dark:bg-blue-950/50 dark:border-blue-900/50 dark:text-blue-400">
                                Folder
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                          <p>Type: <span className="text-slate-600 dark:text-slate-300 font-bold">Public Directory</span></p>
                          <p>Expires: <span className="text-slate-600 dark:text-slate-300 font-bold">{share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : "Never"}</span></p>
                        </div>

                        {/* Public Link Input Widget */}
                        <div className="flex items-center gap-1.5 mt-4">
                          <input 
                            type="text" 
                            value={share.url} 
                            readOnly 
                            className="flex-1 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[10px] font-mono text-slate-500 dark:text-slate-400 focus:outline-none"
                          />
                          <button 
                            onClick={() => copyLink(share.url)} 
                            className="h-9 px-3 bg-slate-800 dark:bg-slate-700 hover:bg-slate-950 dark:hover:bg-slate-600 text-white rounded-xl text-[10px] font-bold transition cursor-pointer"
                          >
                            Copy
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 flex gap-2">
                        <button 
                          onClick={() => revokeShare(share)} 
                          className="flex-1 h-9 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-950 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          <i className="fa-solid fa-trash-can"></i>
                          Disable Link
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
