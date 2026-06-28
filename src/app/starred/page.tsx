"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  provider: string;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FolderItem {
  id: string;
  name: string;
  color: string;
  iconUrl: string | null;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function StarredPage() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<{ id: string; type: "file" | "folder" }[]>([]);
  
  // Filters & Sorting
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const sortDropdownRef = React.useRef<HTMLDivElement>(null);
  const typeDropdownRef = React.useRef<HTMLDivElement>(null);
  const providerDropdownRef = React.useRef<HTMLDivElement>(null);
  const dateDropdownRef = React.useRef<HTMLDivElement>(null);

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(target)) {
        setShowSortDropdown(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(target)) {
        setShowTypeDropdown(false);
      }
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(target)) {
        setShowProviderDropdown(false);
      }
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(target)) {
        setShowDateDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  const fetchStarred = async () => {
    setLoading(true);
    setSelectedItems([]);
    try {
      const response = await fetch("/api/starred/items");
      const data = await response.json();
      setFolders(data.folders || []);
      setFiles(data.files || []);
    } catch (err) {
      console.error("Failed to load starred items:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStarred();
  }, []);

  const toggleFileStar = async (id: string) => {
    try {
      const res = await fetch(`/api/files/${id}/star`, { method: "POST" });
      if (res.ok) {
        setAlertMessage("Item removed from starred.");
        fetchStarred();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleFolderStar = async (id: string) => {
    try {
      const res = await fetch(`/api/folders/${id}/star`, { method: "POST" });
      if (res.ok) {
        setAlertMessage("Item removed from starred.");
        fetchStarred();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isItemSelected = (id: string, type: "file" | "folder") => {
    return selectedItems.some(i => i.id === id && i.type === type);
  };

  const toggleItemSelection = (id: string, type: "file" | "folder") => {
    const isSel = isItemSelected(id, type);
    if (isSel) {
      setSelectedItems(selectedItems.filter(i => !(i.id === id && i.type === type)));
    } else {
      setSelectedItems([...selectedItems, { id, type }]);
    }
  };

  const isAllSelected = () => {
    const totalItems = folders.length + files.length;
    if (totalItems === 0) return false;
    const foldersSelected = folders.every(f => isItemSelected(f.id, "folder"));
    const filesSelected = files.every(f => isItemSelected(f.id, "file"));
    return foldersSelected && filesSelected;
  };

  const toggleSelectAll = () => {
    if (isAllSelected()) {
      setSelectedItems([]);
    } else {
      const all: { id: string; type: "file" | "folder" }[] = [];
      folders.forEach(f => all.push({ id: f.id, type: "folder" }));
      files.forEach(f => all.push({ id: f.id, type: "file" }));
      setSelectedItems(all);
    }
  };

  const isAllFilesSelected = () => {
    if (files.length === 0) return false;
    return files.every(f => isItemSelected(f.id, "file"));
  };

  const toggleSelectAllFiles = () => {
    if (isAllFilesSelected()) {
      setSelectedItems(selectedItems.filter(i => i.type !== "file"));
    } else {
      const fileItems = files.map(f => ({ id: f.id, type: "file" as const }));
      const folderItems = selectedItems.filter(i => i.type === "folder");
      setSelectedItems([...folderItems, ...fileItems]);
    }
  };

  const deselectAll = () => {
    setSelectedItems([]);
  };

  const bulkUnstar = async () => {
    const fileIds = selectedItems.filter(i => i.type === "file").map(i => i.id);
    const folderIds = selectedItems.filter(i => i.type === "folder").map(i => i.id);
    if (fileIds.length === 0 && folderIds.length === 0) return;

    try {
      const res = await fetch("/api/batch/star", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ fileIds, folderIds, star: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Batch unstar operation failed.");

      setAlertMessage("Selected items removed from starred.");
      deselectAll();
      fetchStarred();
    } catch (err: any) {
      setAlertMessage(err.message);
    }
  };

  const previewFile = async (file: FileItem) => {
    try {
      const res = await fetch(`/api/files/${file.id}/preview-token`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to get preview token");
      const data = await res.json();
      const targetUrl = data.path || data.url;
      if (targetUrl) {
        window.open(targetUrl, "_blank");
      }
    } catch (_) {
      try {
        const res2 = await fetch(`/api/files/${file.id}/view-url`);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.url) window.open(data2.url, "_blank");
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const formatBytes = (bytesStr: string | number) => {
    const parsed = typeof bytesStr === "string" ? parseInt(bytesStr) : bytesStr;
    if (isNaN(parsed) || parsed === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(parsed) / Math.log(k));
    return parseFloat((parsed / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSortedFolders = () => {
    if (filterType !== "all" || filterProvider !== "all" || filterDate !== "all") {
      return [];
    }
    const list = [...folders];
    return list.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();

      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "date_desc") return dateB - dateA;
      if (sortBy === "date_asc") return dateA - dateB;
      return a.name.localeCompare(b.name);
    });
  };

  const getSortedFiles = () => {
    let list = [...files];

    // 1. Filter by Type
    if (filterType !== "all") {
      list = list.filter(file => {
        const mime = file.mimeType || "";
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (filterType === "image") return mime.startsWith("image/");
        if (filterType === "video") return mime.startsWith("video/");
        if (filterType === "audio") return mime.startsWith("audio/");
        if (filterType === "document") {
          return mime.includes("pdf") || mime.includes("document") || mime.includes("sheet") || mime.includes("text") || ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext);
        }
        return true;
      });
    }

    // 2. Filter by Provider
    if (filterProvider !== "all") {
      list = list.filter(file => file.provider === filterProvider);
    }

    // 3. Filter by Date
    if (filterDate !== "all") {
      const now = new Date().getTime();
      list = list.filter(file => {
        const date = new Date(file.createdAt || 0).getTime();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (filterDate === "today") return diffDays <= 1;
        if (filterDate === "7days") return diffDays <= 7;
        if (filterDate === "30days") return diffDays <= 30;
        return true;
      });
    }

    return list.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const sizeA = parseInt(a.sizeBytes) || 0;
      const sizeB = parseInt(b.sizeBytes) || 0;

      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "size_desc") return sizeB - sizeA;
      if (sortBy === "size_asc") return sizeA - sizeB;
      if (sortBy === "date_desc") return dateB - dateA;
      if (sortBy === "date_asc") return dateA - dateB;
      return a.name.localeCompare(b.name);
    });
  };

  const sortedFolders = getSortedFolders();
  const sortedFiles = getSortedFiles();

  return (
    <SidebarLayout>
      <div className="relative">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Starred</h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">Quick access to files and folders you have flagged as important.</p>
          </div>
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Select All Checkbox */}
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={isAllSelected()} 
                onChange={toggleSelectAll} 
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900 cursor-pointer"
              />
              <span className="hidden sm:inline">Select All</span>
            </label>

            {/* Sort Dropdown */}
            <div className="relative" ref={sortDropdownRef}>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSortDropdown(!showSortDropdown); setShowTypeDropdown(false); setShowProviderDropdown(false); setShowDateDropdown(false); }} 
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition cursor-pointer" 
                title="Sort Items"
              >
                <i className="fa-solid fa-arrow-down-wide-short text-xs"></i>
                <span className="hidden sm:inline">Sort</span>
              </button>
              {showSortDropdown && (
                <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in duration-100">
                  {[
                    { label: "Name (A-Z)", val: "name_asc" },
                    { label: "Name (Z-A)", val: "name_desc" },
                    { label: "Size (Largest)", val: "size_desc" },
                    { label: "Size (Smallest)", val: "size_asc" },
                    { label: "Date (Newest)", val: "date_desc" },
                    { label: "Date (Oldest)", val: "date_asc" }
                  ].map(opt => (
                    <button 
                      key={opt.val} 
                      onClick={() => { setSortBy(opt.val); setShowSortDropdown(false); }} 
                      className={`flex w-full h-9 items-center justify-between rounded-lg px-3 text-xs font-bold transition text-left cursor-pointer ${
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
          </div>
        </div>

        {/* Filter Chips Row */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5 py-1.5 text-xs">
          {/* Type Filter Dropdown */}
          <div className="relative" ref={typeDropdownRef}>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowTypeDropdown(!showTypeDropdown); setShowSortDropdown(false); setShowProviderDropdown(false); setShowDateDropdown(false); }} 
              className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                filterType !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
              }`}
            >
              <span>Type</span>
              {filterType !== "all" && <span className="font-extrabold uppercase text-[10px]">: {filterType}</span>}
              <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
            </button>
            {showTypeDropdown && (
              <div className="absolute left-0 z-40 mt-1.5 w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in duration-100">
                {[
                  { label: "All Types", val: "all" },
                  { label: "Documents", val: "document" },
                  { label: "Images", val: "image" },
                  { label: "Videos", val: "video" },
                  { label: "Audios", val: "audio" }
                ].map(opt => (
                  <button 
                    key={opt.val} 
                    onClick={() => { setFilterType(opt.val); setShowTypeDropdown(false); }} 
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

          {/* Storage Account Filter Dropdown */}
          <div className="relative" ref={providerDropdownRef}>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowProviderDropdown(!showProviderDropdown); setShowSortDropdown(false); setShowTypeDropdown(false); setShowDateDropdown(false); }} 
              className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                filterProvider !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
              }`}
            >
              <span>Storage</span>
              {filterProvider !== "all" && <span className="font-extrabold uppercase text-[10px]">: {filterProvider.replace("_", " ")}</span>}
              <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
            </button>
            {showProviderDropdown && (
              <div className="absolute left-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in duration-100">
                {[
                  { label: "All Accounts", val: "all" },
                  { label: "Google Drive", val: "google_drive" },
                  { label: "S3 Storage", val: "s3" }
                ].map(opt => (
                  <button 
                    key={opt.val} 
                    onClick={() => { setFilterProvider(opt.val); setShowProviderDropdown(false); }} 
                    className={`flex w-full h-8 items-center justify-between rounded-lg px-2.5 font-bold transition text-left cursor-pointer ${
                      filterProvider === opt.val ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Modified Filter Dropdown */}
          <div className="relative" ref={dateDropdownRef}>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowDateDropdown(!showDateDropdown); setShowSortDropdown(false); setShowTypeDropdown(false); setShowProviderDropdown(false); }} 
              className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                filterDate !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
              }`}
            >
              <span>Last Modified</span>
              {filterDate !== "all" && <span className="font-extrabold uppercase text-[10px]">: {filterDate}</span>}
              <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
            </button>
            {showDateDropdown && (
              <div className="absolute left-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in duration-100">
                {[
                  { label: "Any Time", val: "all" },
                  { label: "Today", val: "today" },
                  { label: "Last 7 Days", val: "7days" },
                  { label: "Last 30 Days", val: "30days" }
                ].map(opt => (
                  <button 
                    key={opt.val} 
                    onClick={() => { setFilterDate(opt.val); setShowDateDropdown(false); }} 
                    className={`flex w-full h-8 items-center justify-between rounded-lg px-2.5 font-bold transition text-left cursor-pointer ${
                      filterDate === opt.val ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset Button */}
          {(filterType !== "all" || filterProvider !== "all" || filterDate !== "all") && (
            <button 
              onClick={() => { setFilterType("all"); setFilterProvider("all"); setFilterDate("all"); }} 
              className="flex h-8 items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-800 px-3 font-semibold text-slate-600 dark:text-slate-400 transition cursor-pointer"
            >
              <span>Reset Filters</span>
              <i className="fa-solid fa-xmark text-[10px]"></i>
            </button>
          )}
        </div>

        {/* Alert Messaging */}
        {alertMessage && (
          <div className="mt-5 rounded-2xl bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50 p-4 text-sm font-bold text-blue-700 dark:text-blue-400 flex items-center justify-between">
            <span>{alertMessage}</span>
            <button onClick={() => setAlertMessage(null)} className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer">
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="mt-8 grid gap-4 grid-cols-2 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 animate-pulse flex flex-col justify-between">
                <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800"></div>
                <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          /* Content Area */
          <div className="mt-8 space-y-8">
            {/* Empty State */}
            {folders.length === 0 && files.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm max-w-lg mx-auto">
                <i className="fa-regular fa-star text-4xl text-slate-400 dark:text-slate-500"></i>
                <h3 className="mt-4 text-base font-black text-slate-800 dark:text-slate-100">No starred items</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">Right-click files or folders in your drive and select Star to add them here.</p>
              </div>
            )}

            {/* Folders Section */}
            {sortedFolders.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Starred Folders</h2>
                <div className="mt-3 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                  {sortedFolders.map(folder => (
                    <div 
                      key={folder.id}
                      onDoubleClick={() => window.location.href = `/all-files?folderId=${folder.id}`} 
                      className={`group relative rounded-2xl border bg-white dark:border-slate-800 dark:bg-slate-900 p-4 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-lg shadow-sm transition duration-155 cursor-pointer flex flex-col justify-between min-h-[7rem] ${
                        isItemSelected(folder.id, "folder") ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/10 dark:bg-blue-950/10" : "border-slate-200/60"
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <div className={`absolute top-3 left-3 z-10 transition-opacity duration-150 ${selectedItems.length > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        <input 
                          type="checkbox" 
                          checked={isItemSelected(folder.id, "folder")} 
                          onChange={() => toggleItemSelection(folder.id, "folder")} 
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-start justify-between pl-6">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950/40 ${folder.color || "text-blue-500"}`}>
                          <i className="fa-solid fa-folder text-xl"></i>
                        </div>
                        {/* Star toggle action */}
                        <button onClick={(e) => { e.stopPropagation(); toggleFolderStar(folder.id); }} title="Remove from Starred" className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-400 hover:text-slate-400 transition cursor-pointer">
                          <i className="fa-solid fa-star text-sm"></i>
                        </button>
                      </div>
                      <div className="min-w-0 mt-3 pl-6">
                        <p className="truncate font-bold text-slate-800 dark:text-slate-200 text-sm">{folder.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files Section */}
            {sortedFiles.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Starred Files</h2>
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/10 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-3.5 w-10">
                            <input 
                              type="checkbox" 
                              checked={isAllFilesSelected()} 
                              onChange={toggleSelectAllFiles} 
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900 cursor-pointer"
                            />
                          </th>
                          <th className="p-4 pl-2">Name</th>
                          <th className="p-4">Size</th>
                          <th className="p-4 hidden md:table-cell">Updated At</th>
                          <th className="p-4 text-right pr-6">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {sortedFiles.map(file => (
                          <tr 
                            key={file.id}
                            onDoubleClick={() => previewFile(file)} 
                            className={`hover:bg-slate-50/40 dark:hover:bg-slate-950/10 transition cursor-pointer ${
                              isItemSelected(file.id, "file") ? "bg-blue-50/20 dark:bg-blue-950/10" : ""
                            }`}
                          >
                            <td className="px-4 py-3.5 w-10">
                              <input 
                                type="checkbox" 
                                checked={isItemSelected(file.id, "file")} 
                                onChange={() => toggleItemSelection(file.id, "file")} 
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900 cursor-pointer"
                              />
                            </td>
                            <td className="p-4 pl-2 flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-400">
                                <i className="fa-solid fa-file text-sm"></i>
                              </div>
                              <span className="truncate font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:underline" onClick={() => previewFile(file)}>{file.name}</span>
                            </td>
                            <td className="p-4 font-bold text-slate-400 dark:text-slate-500">{formatBytes(file.sizeBytes)}</td>
                            <td className="p-4 text-xs font-semibold text-slate-400 hidden md:table-cell">{formatDate(file.updatedAt)}</td>
                            <td className="p-4 text-right pr-6">
                              <div className="inline-flex gap-1 justify-end">
                                <button onClick={() => previewFile(file)} title="Preview" className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer">
                                  <i className="fa-solid fa-eye text-sm"></i>
                                </button>
                                <a href={`/api/files/${file.id}/download`} download title="Download" className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer">
                                  <i className="fa-solid fa-download text-sm"></i>
                                </a>
                                <button onClick={() => toggleFileStar(file.id)} title="Remove from Starred" className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-400 hover:text-slate-400 transition cursor-pointer">
                                  <i className="fa-solid fa-star text-sm"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating Bulk Actions Toolbar */}
        {selectedItems.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-y-0 -translate-x-1/2 z-40 flex items-center gap-4 px-6 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl transition duration-150 flex-wrap sm:flex-nowrap">
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 whitespace-nowrap">{selectedItems.length} items selected</span>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
            <div className="flex items-center gap-1">
              <button onClick={bulkUnstar} title="Unstar Selected" className="h-9 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <i className="fa-regular fa-star"></i> <span>Unstar</span>
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
              <button onClick={deselectAll} className="h-9 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition text-xs font-bold cursor-pointer">Clear</button>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
