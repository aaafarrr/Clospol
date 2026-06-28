"use client";

import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Download, 
  Lock, 
  AlertCircle, 
  ExternalLink,
  ShieldAlert,
  Loader2,
  Info,
  Folder,
  ChevronRight,
  Eye,
  FileIcon,
  X
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FolderItem {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

export default function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<any>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Password gate form states
  const [password, setPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // File Preview Modal inside Shared Folder
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  const loadShareMetadata = async (targetToken: string, folderId: string | null = null) => {
    if (!targetToken) return;
    setLoading(true);
    setError(null);
    try {
      const url = folderId 
        ? `/api/public/files/${targetToken}/data?folderId=${folderId}`
        : `/api/public/files/${targetToken}/data`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Unable to fetch share link details.");
      }
      setShareData(data);
      if (data.isFolder && !folderId) {
        // If it's a folder, set initial root folder id
        setCurrentFolderId(data.shareId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadShareMetadata(token, currentFolderId);
    }
  }, [token, currentFolderId]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const res = await fetch(`/api/public/files/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Incorrect password");
      }
      // Reload metadata on success
      loadShareMetadata(token, currentFolderId);
    } catch (err: any) {
      setUnlockError(err.message);
    } finally {
      setUnlockLoading(false);
    }
  };

  const formatSize = (bytesStr: string) => {
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes) || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIconClass = (name: string) => {
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

  const renderPreviewElement = (fileOverride: FileItem | null = null) => {
    const activeFile = fileOverride || shareData;
    if (!activeFile) return null;
    const mime = activeFile.mimeType?.toLowerCase() || "";
    
    // Generate correct preview path
    const previewUrl = fileOverride 
      ? `/api/public/files/${token}/preview?fileId=${fileOverride.id}`
      : `/api/public/files/${token}/preview`;

    if (mime.startsWith("video/")) {
      return (
        <video 
          controls 
          preload="metadata" 
          src={previewUrl} 
          className="w-full max-h-[60vh] rounded-2xl bg-black border border-slate-900 shadow-2xl" 
        />
      );
    }

    if (mime.startsWith("image/")) {
      return (
        <img 
          src={previewUrl} 
          alt={activeFile.fileName || activeFile.name} 
          className="max-h-[60vh] max-w-full rounded-2xl mx-auto object-contain bg-slate-950/40 border border-slate-900 shadow-xl"
        />
      );
    }

    if (mime.startsWith("audio/")) {
      return (
        <div className="p-8 bg-slate-950/40 border border-slate-900 rounded-2xl flex flex-col items-center justify-center space-y-4">
          <FileText size={48} className="text-slate-400" />
          <audio 
            controls 
            src={previewUrl} 
            className="w-full max-w-md" 
          />
        </div>
      );
    }

    if (mime === "application/pdf") {
      return (
        <iframe 
          src={previewUrl} 
          title={activeFile.fileName || activeFile.name}
          className="w-full h-[60vh] rounded-2xl border border-slate-900 bg-slate-900 shadow-xl" 
        />
      );
    }

    if (mime.startsWith("text/") || mime === "application/json") {
      return (
        <iframe 
          src={previewUrl} 
          title={activeFile.fileName || activeFile.name}
          className="w-full h-[50vh] rounded-2xl border border-slate-900 bg-slate-900 font-mono text-xs text-slate-300 p-4 shadow-xl" 
        />
      );
    }

    return (
      <div className="p-12 bg-slate-950/20 border border-slate-900 rounded-2xl text-center flex flex-col items-center justify-center space-y-3">
        <FileText size={40} className="text-slate-500" />
        <p className="text-xs font-semibold text-slate-400">Direct preview is not supported for this file type.</p>
        <p className="text-[10px] text-slate-500">Please download the file to open it locally.</p>
      </div>
    );
  };

  if (loading && !shareData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200">
        <Loader2 size={36} className="animate-spin text-blue-500" />
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 font-semibold uppercase tracking-wider">Syncing Share Credentials...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-[#020617] p-4 text-center text-slate-800 dark:text-slate-200">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800/80 max-w-md space-y-4 shadow-xl">
          <ShieldAlert size={48} className="text-rose-500 mx-auto animate-pulse" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-200">Access Restricted</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
          <a href="/login" className="inline-block text-xs font-bold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Password Lock gate view
  if (shareData?.locked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-[#020617] p-4 text-slate-800 dark:text-slate-200 relative select-none">
        <div className="fixed top-6 right-6 z-50">
          <ThemeToggle />
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 w-full max-w-sm p-8 rounded-3xl space-y-6 shadow-xl">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-md">
              <Lock size={20} />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-200">Password Required</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate px-4">"{shareData.fileName}" is password protected.</p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4 text-xs">
            <div className="flex flex-col gap-1.5">
              <input
                type="password"
                required
                placeholder="Enter password to open"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 text-center focus:outline-none focus:border-blue-500 placeholder:text-slate-400"
              />
            </div>

            {unlockError && (
              <p className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold flex items-center gap-1.5 justify-center">
                <AlertCircle size={11} />
                {unlockError}
              </p>
            )}

            <button
              type="submit"
              disabled={unlockLoading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/10"
            >
              {unlockLoading && <Loader2 size={13} className="animate-spin" />}
              Unlock Shared Gateway
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isFolder = shareData?.isFolder;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 flex flex-col justify-between transition-colors duration-200">
      
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-900/60 bg-white/80 dark:bg-[#020617]/40 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-500/25">
              C
            </div>
            <span className="font-extrabold text-sm tracking-wide text-slate-900 dark:text-white">Clospol <span className="text-blue-600 dark:text-blue-400">Share</span></span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-black hidden sm:block">
              Public Gateway
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 space-y-6">
        
        {/* Render FOLDER Share Link Explorer */}
        {isFolder ? (
          <div className="space-y-6">
            
            {/* Folder Header & Breadcrumbs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Folder className="text-blue-500" size={22} />
                  {shareData.fileName}
                </h1>
                
                {/* Public Shared Breadcrumbs */}
                <div className="flex items-center flex-wrap gap-1 mt-2 text-xs text-slate-400 dark:text-slate-500 font-semibold">
                  {shareData.breadcrumbs?.map((crumb: BreadcrumbItem, idx: number) => (
                    <React.Fragment key={crumb.id}>
                      {idx > 0 && <ChevronRight size={12} className="text-slate-300 dark:text-slate-600 shrink-0" />}
                      <button 
                        onClick={() => setCurrentFolderId(crumb.id)} 
                        className={`hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition ${
                          idx === shareData.breadcrumbs.length - 1 ? "text-slate-800 dark:text-slate-300 font-bold" : ""
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Folder Content Table */}
            <div className="bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-900 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/10 dark:shadow-none">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/20 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3.5 px-6">Name</th>
                      <th className="py-3.5 px-6">Size</th>
                      <th className="py-3.5 px-6">Date Shared</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900/60 font-semibold text-slate-600 dark:text-slate-300">
                    {/* Render Subfolders */}
                    {shareData.subFolders?.length === 0 && shareData.files?.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400 dark:text-slate-500">
                          This folder is empty.
                        </td>
                      </tr>
                    )}

                    {shareData.subFolders?.map((subFolder: FolderItem) => (
                      <tr 
                        key={subFolder.id}
                        onClick={() => setCurrentFolderId(subFolder.id)}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-950/25 transition cursor-pointer group"
                      >
                        <td className="py-3.5 px-6 flex items-center gap-3">
                          <Folder size={18} className="text-blue-500 shrink-0 group-hover:scale-105 transition-transform" />
                          <span className="text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate max-w-sm">
                            {subFolder.name}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-slate-400 dark:text-slate-500">—</td>
                        <td className="py-3.5 px-6 text-slate-400 dark:text-slate-500">{new Date(subFolder.createdAt).toLocaleDateString()}</td>
                        <td className="py-3.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => setCurrentFolderId(subFolder.id)}
                            className="inline-flex h-8 px-3 items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-transparent rounded-lg font-bold transition cursor-pointer"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}

                    {/* Render Files */}
                    {shareData.files?.map((file: FileItem) => (
                      <tr 
                        key={file.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-950/25 transition group"
                      >
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-5 shrink-0 flex items-center justify-center">
                              <i className={`fa-solid ${getFileIconClass(file.name)} text-sm`}></i>
                            </div>
                            <span className="text-slate-800 dark:text-slate-200 truncate max-w-sm">{file.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 text-slate-700 dark:text-slate-400 font-bold">{formatSize(file.sizeBytes)}</td>
                        <td className="py-3.5 px-6 text-slate-400 dark:text-slate-500">{new Date(file.createdAt).toLocaleDateString()}</td>
                        <td className="py-3.5 px-6 text-right space-x-2">
                          <button 
                            onClick={() => setPreviewFile(file)}
                            className="inline-flex h-8 w-8 items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 rounded-lg border border-slate-200/50 dark:border-transparent transition cursor-pointer"
                            title="Preview File"
                          >
                            <Eye size={14} />
                          </button>
                          <a 
                            href={`/api/public/files/${token}/download?fileId=${file.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center bg-blue-50 dark:bg-blue-950/40 border border-blue-200/55 dark:border-blue-900/35 hover:bg-blue-600 dark:hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white dark:hover:text-white rounded-lg transition cursor-pointer"
                            title="Download File"
                          >
                            <Download size={14} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Folder sharing notice */}
            <div className="p-4 bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl flex items-start gap-3.5 text-xs text-slate-600 dark:text-slate-400">
              <Info size={16} className="text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-305">Public Shared Folder Access</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500 leading-relaxed">
                  You are browsing a folder shared via secure temporary token. You can preview supported files directly in your browser or download individual items.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Render FILE Share Link Page */
          <div className="space-y-4">
            <div className="flex items-col sm:flex-row sm:items-center justify-between gap-4 px-1">
              <div className="overflow-hidden">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate leading-snug">{shareData.fileName}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatSize(shareData.sizeBytes)} • {shareData.mimeType}</p>
              </div>

              <a
                href={`/api/public/files/${token}/download`}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition flex-shrink-0"
              >
                <Download size={14} />
                Download File
              </a>
            </div>

            <div className="bg-white dark:bg-slate-900/20 p-4 rounded-3xl border border-slate-200 dark:border-slate-900 shadow-xl shadow-slate-200/10 dark:shadow-none">
              {renderPreviewElement()}
            </div>

            <div className="p-4 bg-slate-100/50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-900 rounded-2xl flex items-start gap-3.5 text-xs text-slate-600 dark:text-slate-400">
              <Info size={16} className="text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-slate-800 dark:text-slate-300">Embedding this preview?</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500">
                  You can embed the preview layout seamlessly without header overlays inside pages using:
                  <span className="font-mono text-blue-600 dark:text-blue-400 block mt-1.5 select-all bg-slate-50 dark:bg-slate-950 p-1.5 rounded border border-slate-200 dark:border-slate-900">
                    {`${origin}/public/files/${token}/embed`}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* File Preview Modal (Overlay for Folder share) */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-[#020617]/90 dark:bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#090d1f] w-full max-w-4xl rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-md">{previewFile.name}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{formatSize(previewFile.sizeBytes)} • {previewFile.mimeType}</p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/public/files/${token}/download?fileId=${previewFile.id}`}
                  className="h-8 flex items-center gap-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Download size={13} />
                  Download
                </a>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 flex flex-col justify-center bg-slate-50/50 dark:bg-slate-950/20">
              {renderPreviewElement(previewFile)}
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 py-6 text-center text-[10px] text-slate-400 dark:text-slate-500">
        <p>© 2026 Clospol</p>
      </footer>
    </div>
  );
}
