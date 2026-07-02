"use client";

import React, { useState, useEffect, useRef } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  provider: string;
  deletedAt: string;
}

interface FolderItem {
  id: string;
  name: string;
  color: string;
  iconUrl: string | null;
  deletedAt: string;
}

export default function TrashPage() {
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
  const toast = useToast();

  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  const fetchTrash = async () => {
    setLoading(true);
    setSelectedItems([]);
    try {
      const response = await fetch("/api/trash/items");
      const data = await response.json();
      setFolders(data.folders || []);
      setFiles(data.files || []);
    } catch (err) {
      console.error("Failed to load trash items:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

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

  const restoreFile = async (id: string) => {
    try {
      const res = await fetch(`/api/files/${id}/restore`, { method: "POST" });
      if (res.ok) {
        toast.success("File successfully restored.");
        fetchTrash();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to restore file.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while restoring the file.");
    }
  };

  const deleteFilePermanently = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this file? This will delete it from physical cloud storage and cannot be undone.")) return;
    try {
      const res = await fetch(`/api/files/${id}/permanent`, { method: "DELETE" });
      if (res.ok) {
        toast.success("File permanently deleted from storage.");
        fetchTrash();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to permanently delete file.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while deleting the file.");
    }
  };

  const restoreFolder = async (id: string) => {
    try {
      const res = await fetch(`/api/folders/${id}/restore`, { method: "POST" });
      if (res.ok) {
        toast.success("Folder structure restored successfully.");
        fetchTrash();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to restore folder.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while restoring the folder.");
    }
  };

  const deleteFolderPermanently = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this folder and all its child files? This deletes them from physical cloud storage and cannot be undone.")) return;
    try {
      const res = await fetch(`/api/folders/${id}/permanent`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Folder and all its contents permanently deleted from storage.");
        fetchTrash();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to permanently delete folder.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while deleting the folder.");
    }
  };

  const isItemSelected = (id: string, type: "file" | "folder") => {
    return selectedItems.some(i => i.id === id && i.type === type);
  };

  const toggleItemSelection = (id: string, type: "file" | "folder") => {
    const exists = selectedItems.some(i => i.id === id && i.type === type);
    if (exists) {
      setSelectedItems(selectedItems.filter(i => !(i.id === id && i.type === type)));
    } else {
      setSelectedItems([...selectedItems, { id, type }]);
    }
  };

  const isAllSelected = () => {
    const total = folders.length + files.length;
    if (total === 0) return false;
    return selectedItems.length === total;
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
    return files.every(file => isItemSelected(file.id, "file"));
  };

  const toggleSelectAllFiles = () => {
    if (isAllSelected()) {
      setSelectedItems(selectedItems.filter(i => i.type !== "file"));
    } else {
      const fileSelections = files.map(f => ({ id: f.id, type: "file" as const }));
      const filtered = selectedItems.filter(i => i.type !== "file");
      setSelectedItems([...filtered, ...fileSelections]);
    }
  };

  const deselectAll = () => {
    setSelectedItems([]);
  };

  const bulkRestore = async () => {
    const fileIds = selectedItems.filter(i => i.type === "file").map(i => i.id);
    const folderIds = selectedItems.filter(i => i.type === "folder").map(i => i.id);
    if (fileIds.length === 0 && folderIds.length === 0) return;

    try {
      const res = await fetch("/api/batch/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderIds })
      });
      if (res.ok) {
        toast.success("Selected items restored successfully.");
        setSelectedItems([]);
        fetchTrash();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to restore selected items.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while performing bulk restore.");
    }
  };

  const bulkPermanentDelete = async () => {
    if (!confirm("Are you sure you want to permanently delete the selected items and all their contents? This deletes them from physical cloud storage and cannot be undone.")) return;
    const fileIds = selectedItems.filter(i => i.type === "file").map(i => i.id);
    const folderIds = selectedItems.filter(i => i.type === "folder").map(i => i.id);
    if (fileIds.length === 0 && folderIds.length === 0) return;

    try {
      const res = await fetch("/api/batch/permanent-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderIds })
      });
      if (res.ok) {
        toast.success("Selected items permanently deleted.");
        setSelectedItems([]);
        fetchTrash();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to delete selected items.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while performing bulk deletion.");
    }
  };

  const formatBytes = (bytes: string) => {
    const parsed = parseInt(bytes);
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
      minute: "2-digit"
    });
  };

  const getSortedFolders = () => {
    if (filterType !== "all" || filterProvider !== "all" || filterDate !== "all") {
      return [];
    }
    const list = [...folders];
    return list.sort((a, b) => {
      const dateA = new Date(a.deletedAt).getTime();
      const dateB = new Date(b.deletedAt).getTime();

      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "date_desc") return dateB - dateA;
      if (sortBy === "date_asc") return dateA - dateB;
      return a.name.localeCompare(b.name);
    });
  };

  const getSortedFiles = () => {
    let list = [...files];

    // Filter by Type
    if (filterType !== "all") {
      list = list.filter(file => {
        const mime = file.mimeType || "";
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (filterType === "image") return mime.startsWith("image/");
        if (filterType === "video") return mime.startsWith("video/");
        if (filterType === "audio") return mime.startsWith("audio/");
        if (filterType === "document") {
          return (
            mime.includes("pdf") ||
            mime.includes("document") ||
            mime.includes("sheet") ||
            mime.includes("text") ||
            ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext)
          );
        }
        return true;
      });
    }

    // Filter by Provider
    if (filterProvider !== "all") {
      list = list.filter(file => file.provider === filterProvider);
    }

    // Filter by Date
    if (filterDate !== "all") {
      const now = new Date();
      list = list.filter(file => {
        const date = new Date(file.deletedAt);
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (filterDate === "today") {
          return diffDays <= 1;
        }
        if (filterDate === "7days") {
          return diffDays <= 7;
        }
        if (filterDate === "30days") {
          return diffDays <= 30;
        }
        return true;
      });
    }

    // Sort files
    return list.sort((a, b) => {
      const dateA = new Date(a.deletedAt).getTime();
      const dateB = new Date(b.deletedAt).getTime();

      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "size_desc") return parseInt(b.sizeBytes) - parseInt(a.sizeBytes);
      if (sortBy === "size_asc") return parseInt(a.sizeBytes) - parseInt(b.sizeBytes);
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
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Trash</h1>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">
              Manage deleted files and folders. Items here still count towards your storage until permanently deleted.
            </p>
          </div>

          {/* 30-Day Auto Cleanup Notice Banner */}
          <div className="flex items-center gap-3 p-3.5 px-4.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <i className="fa-solid fa-triangle-exclamation text-lg flex-shrink-0 text-amber-500 dark:text-amber-400"></i>
            <div className="flex-1 text-xs">
              <span className="font-bold block text-[13px] mb-0.5">Auto-Cleanup Reminder</span>
              Items in the Trash will be permanently deleted after <strong>30 days</strong>. Starred items cannot be deleted to avoid accidental loss.
            </div>
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
                onClick={() => {
                  setShowSortDropdown(!showSortDropdown);
                  setShowTypeDropdown(false);
                  setShowProviderDropdown(false);
                  setShowDateDropdown(false);
                }} 
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition" 
                title="Sort Items"
              >
                <i className="fa-solid fa-arrow-down-wide-short text-xs"></i>
                <span className="hidden sm:inline">Sort</span>
              </button>
              {showSortDropdown && (
                <div className="absolute right-0 z-50 mt-2 w-48 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 shadow-2xl space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  {[
                    { val: "name_asc", label: "Name (A-Z)" },
                    { val: "name_desc", label: "Name (Z-A)" },
                    { val: "size_desc", label: "Size (Largest)" },
                    { val: "size_asc", label: "Size (Smallest)" },
                    { val: "date_desc", label: "Date (Newest)" },
                    { val: "date_asc", label: "Date (Oldest)" }
                  ].map((item) => (
                    <button 
                      key={item.val}
                      onClick={() => {
                        setSortBy(item.val);
                        setShowSortDropdown(false);
                      }} 
                      className={`flex w-full h-9 items-center justify-between rounded-lg px-3 text-xs font-bold transition text-left ${
                        sortBy === item.val 
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' 
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{item.label}</span>
                      {sortBy === item.val && <i className="fa-solid fa-check text-[10px]"></i>}
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
              onClick={() => {
                setShowTypeDropdown(!showTypeDropdown);
                setShowSortDropdown(false);
                setShowProviderDropdown(false);
                setShowDateDropdown(false);
              }} 
              className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                filterType !== 'all' ? 'border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' : ''
              }`}
            >
              <span>Type</span>
              {filterType !== 'all' && (
                <span className="font-extrabold uppercase text-[10px]">
                  : {filterType}
                </span>
              )}
              <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
            </button>
            {showTypeDropdown && (
              <div className="absolute left-0 z-40 mt-1.5 w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                {[
                  { val: "all", label: "All Types" },
                  { val: "document", label: "Documents" },
                  { val: "image", label: "Images" },
                  { val: "video", label: "Videos" },
                  { val: "audio", label: "Audios" }
                ].map((item) => (
                  <button 
                    key={item.val}
                    onClick={() => {
                      setFilterType(item.val);
                      setShowTypeDropdown(false);
                    }} 
                    className={`flex w-full h-8 items-center justify-between rounded-lg px-2.5 font-bold transition text-left ${
                      filterType === item.val 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Storage Account Filter Dropdown */}
          <div className="relative" ref={providerDropdownRef}>
            <button 
              onClick={() => {
                setShowProviderDropdown(!showProviderDropdown);
                setShowSortDropdown(false);
                setShowTypeDropdown(false);
                setShowDateDropdown(false);
              }} 
              className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                filterProvider !== 'all' ? 'border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' : ''
              }`}
            >
              <span>Storage</span>
              {filterProvider !== 'all' && (
                <span className="font-extrabold uppercase text-[10px]">
                  : {filterProvider.replace('_', ' ')}
                </span>
              )}
              <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
            </button>
            {showProviderDropdown && (
              <div className="absolute left-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                {[
                  { val: "all", label: "All Accounts" },
                  { val: "google_drive", label: "Google Drive" },
                  { val: "s3", label: "S3 Storage" },
                  { val: "local", label: "Local Storage" }
                ].map((item) => (
                  <button 
                    key={item.val}
                    onClick={() => {
                      setFilterProvider(item.val);
                      setShowProviderDropdown(false);
                    }} 
                    className={`flex w-full h-8 items-center justify-between rounded-lg px-2.5 font-bold transition text-left ${
                      filterProvider === item.val 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date Modified Filter Dropdown */}
          <div className="relative" ref={dateDropdownRef}>
            <button 
              onClick={() => {
                setShowDateDropdown(!showDateDropdown);
                setShowSortDropdown(false);
                setShowTypeDropdown(false);
                setShowProviderDropdown(false);
              }} 
              className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                filterDate !== 'all' ? 'border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' : ''
              }`}
            >
              <span>Last Modified</span>
              {filterDate !== 'all' && (
                <span className="font-extrabold uppercase text-[10px]">
                  : {filterDate}
                </span>
              )}
              <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
            </button>
            {showDateDropdown && (
              <div className="absolute left-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                {[
                  { val: "all", label: "Any Time" },
                  { val: "today", label: "Today" },
                  { val: "7days", label: "Last 7 Days" },
                  { val: "30days", label: "Last 30 Days" }
                ].map((item) => (
                  <button 
                    key={item.val}
                    onClick={() => {
                      setFilterDate(item.val);
                      setShowDateDropdown(false);
                    }} 
                    className={`flex w-full h-8 items-center justify-between rounded-lg px-2.5 font-bold transition text-left ${
                      filterDate === item.val 
                        ? 'text-blue-600 dark:text-blue-400' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset Button */}
          {(filterType !== 'all' || filterProvider !== 'all' || filterDate !== 'all') && (
            <button 
              onClick={() => {
                setFilterType('all');
                setFilterProvider('all');
                setFilterDate('all');
              }} 
              className="flex h-8 items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 font-semibold text-slate-600 dark:text-slate-400 transition"
            >
              <span>Reset Filters</span>
              <i className="fa-solid fa-xmark text-[10px]"></i>
            </button>
          )}
        </div>



        {/* Content Area */}
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
          <div className="mt-8 space-y-8">
            {/* Empty State */}
            {sortedFolders.length === 0 && sortedFiles.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm max-w-lg mx-auto">
                <i className="fa-solid fa-trash-can-slash text-4xl text-slate-400 dark:text-slate-500"></i>
                <h3 className="mt-4 text-base font-black text-slate-800 dark:text-slate-100">Trash is empty</h3>
                <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">Deleted files and folders will appear here.</p>
              </div>
            )}

            {/* Folders Section */}
            {sortedFolders.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Deleted Folders</h2>
                <div className="mt-3 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                  {sortedFolders.map((folder) => {
                    const selected = isItemSelected(folder.id, "folder");
                    return (
                      <div 
                        key={folder.id}
                        className={`group relative rounded-2xl border bg-white dark:bg-slate-900 p-4 hover:shadow-md transition duration-155 flex flex-col justify-between min-h-[7.5rem] ${
                          selected 
                            ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/10 dark:bg-blue-950/10' 
                            : 'border-slate-200/60 dark:border-slate-800'
                        }`}
                      >
                        {/* Selection Checkbox */}
                        <div className={`absolute top-3 left-3 z-10 transition-opacity duration-150 ${
                          selectedItems.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          <input 
                            type="checkbox" 
                            checked={selected} 
                            onChange={() => toggleItemSelection(folder.id, "folder")} 
                            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900 cursor-pointer"
                          />
                        </div>
                        <div className="flex items-start justify-between pl-6">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950/40 ${folder.color || 'text-blue-500'}`}>
                            <i className="fa-solid fa-folder text-xl"></i>
                          </div>
                          {/* Actions */}
                          <div className="flex gap-1">
                            <button 
                              onClick={() => restoreFolder(folder.id)} 
                              title="Restore Folder" 
                              className="rounded-lg p-1.5 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 text-slate-400 transition cursor-pointer"
                            >
                              <i className="fa-solid fa-trash-arrow-up text-sm"></i>
                            </button>
                            <button 
                              onClick={() => deleteFolderPermanently(folder.id)} 
                              title="Delete Permanently" 
                              className="rounded-lg p-1.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 text-slate-400 transition cursor-pointer"
                            >
                              <i className="fa-solid fa-trash-can text-sm"></i>
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0 mt-3 pl-6">
                          <p className="truncate font-bold text-slate-800 dark:text-slate-200 text-sm">{folder.name}</p>
                          <p className="truncate text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">Deleted {formatDate(folder.deletedAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Files Section */}
            {sortedFiles.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Deleted Files</h2>
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
                          <th className="p-4 hidden md:table-cell">Deleted At</th>
                          <th className="p-4 text-right pr-6">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {sortedFiles.map((file) => {
                          const selected = isItemSelected(file.id, "file");
                          return (
                            <tr 
                              key={file.id} 
                              className={`hover:bg-slate-50/40 dark:hover:bg-slate-950/10 transition ${
                                selected ? 'bg-blue-50/20 dark:bg-blue-950/10' : ''
                              }`}
                            >
                              <td className="px-4 py-3.5 w-10">
                                <input 
                                  type="checkbox" 
                                  checked={selected} 
                                  onChange={() => toggleItemSelection(file.id, "file")} 
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-900 cursor-pointer"
                                />
                              </td>
                              <td className="p-4 pl-2 flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-400">
                                  <i className="fa-solid fa-file"></i>
                                </div>
                                <span className="truncate font-bold text-slate-800 dark:text-slate-200">{file.name}</span>
                              </td>
                              <td className="p-4 font-bold text-slate-400 dark:text-slate-500">{formatBytes(file.sizeBytes)}</td>
                              <td className="p-4 text-xs font-semibold text-slate-400 hidden md:table-cell">{formatDate(file.deletedAt)}</td>
                              <td className="p-4 text-right pr-6">
                                <div className="inline-flex gap-1 justify-end">
                                  <button 
                                    onClick={() => restoreFile(file.id)} 
                                    title="Restore File" 
                                    className="rounded-lg p-1.5 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 text-slate-400 transition cursor-pointer"
                                  >
                                    <i className="fa-solid fa-trash-arrow-up text-sm"></i>
                                  </button>
                                  <button 
                                    onClick={() => deleteFilePermanently(file.id)} 
                                    title="Delete Permanently" 
                                    className="rounded-lg p-1.5 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 text-slate-400 transition cursor-pointer"
                                  >
                                    <i className="fa-solid fa-trash-can text-sm"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-6 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl transition duration-150 flex-wrap sm:flex-nowrap animate-in fade-in slide-in-from-bottom-2">
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 whitespace-nowrap">
              {selectedItems.length} items selected
            </span>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
            <div className="flex items-center gap-1">
              <button 
                onClick={bulkRestore} 
                title="Restore Selected" 
                className="h-9 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-trash-arrow-up"></i> <span>Restore</span>
              </button>
              <button 
                onClick={bulkPermanentDelete} 
                title="Delete Permanently" 
                className="h-9 px-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-trash-can"></i> <span>Delete Permanently</span>
              </button>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>
              <button 
                onClick={deselectAll} 
                className="h-9 px-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition text-xs font-bold cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
