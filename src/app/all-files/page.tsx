"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import SidebarLayout from "@/components/layout/sidebar";
import { useSearchParams, useRouter } from "next/navigation";

interface DBFolder {
  id: string;
  name: string;
  color: string;
  iconUrl: string | null;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
}

interface DBFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  provider: string;
  isStarred: boolean;
  createdAt: string;
  connectedAccountId: string;
  folderId?: string | null;
}

interface UploadQueueItem {
  id: string;
  name: string;
  relativePath: string;
  status: "queued" | "uploading" | "completed" | "failed";
  progress: number;
  size: number;
}

export default function AllFilesPage() {
  return (
    <Suspense fallback={
      <SidebarLayout>
        <div className="flex gap-6 items-start relative h-full w-full animate-pulse p-8">
          <div className="flex-1 space-y-6">
            <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
            <div className="h-4 w-96 bg-slate-200 dark:bg-slate-800 rounded"></div>
          </div>
        </div>
      </SidebarLayout>
    }>
      <AllFilesContent />
    </Suspense>
  );
}

function AllFilesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const folderIdParam = searchParams.get("folderId") || null;

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "All Files" }
  ]);

  const [folders, setFolders] = useState<DBFolder[]>([]);
  const [files, setFiles] = useState<DBFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Drag and drop states
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = React.useRef(0);

  // Upload progress states
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isWidgetExpanded, setIsWidgetExpanded] = useState(true);

  // Download progress states
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "preparing" | "ready" | "failed">("idle");
  const [downloadProgressText, setDownloadProgressText] = useState("");

  // Core Actions states
  const [activeItem, setActiveItem] = useState<{ 
    id: string; 
    name: string; 
    type: "file" | "folder"; 
    provider?: string; 
    mimeType?: string; 
    isStarred?: boolean; 
    connectedAccountId?: string;
  } | null>(null);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [menuOpenItemId, setMenuOpenItemId] = useState<string | null>(null);

  // Details Sidebar states
  const [showDetailsSidebar, setShowDetailsSidebar] = useState(false);
  const [detailsItem, setDetailsItem] = useState<{ 
    id: string; 
    name: string; 
    type: "file" | "folder"; 
    provider?: string; 
    mimeType?: string; 
    sizeBytes?: string; 
    isStarred?: boolean; 
    createdAt?: string; 
    updatedAt?: string; 
    connectedAccountId?: string;
    color?: string;
  } | null>(null);

  // On mount: restore the last visited directory or deep link
  useEffect(() => {
    if (folderIdParam) {
      setCurrentFolderId(folderIdParam);
      setIsRestored(true);
    } else {
      const savedFolderId = localStorage.getItem("lastFolderId");
      if (savedFolderId && savedFolderId !== "null" && savedFolderId !== null) {
        setCurrentFolderId(savedFolderId);
        router.push(`/all-files?folderId=${savedFolderId}`);
        setIsRestored(true);
      } else {
        setIsRestored(true);
      }
    }
  }, []);

  // Sync folderIdParam into currentFolderId
  useEffect(() => {
    if (isRestored) {
      setCurrentFolderId(folderIdParam);
    }
  }, [folderIdParam, isRestored]);

  // When directory changes: save it to localStorage
  useEffect(() => {
    if (!isRestored) return;
    localStorage.setItem("lastFolderId", currentFolderId || "null");
  }, [currentFolderId, isRestored]);

  // Sync selectedItems with detailsItem
  useEffect(() => {
    if (selectedItems.size === 1) {
      const selectedId = Array.from(selectedItems)[0];
      const selectedFile = files.find((f) => f.id === selectedId);
      if (selectedFile) {
        setDetailsItem({
          id: selectedFile.id,
          name: selectedFile.name,
          type: "file",
          provider: selectedFile.provider,
          mimeType: selectedFile.mimeType,
          sizeBytes: selectedFile.sizeBytes,
          isStarred: selectedFile.isStarred,
          createdAt: selectedFile.createdAt,
          updatedAt: selectedFile.createdAt,
          connectedAccountId: selectedFile.connectedAccountId,
        });
        return;
      }
      const selectedFolder = folders.find((f) => f.id === selectedId);
      if (selectedFolder) {
        setDetailsItem({
          id: selectedFolder.id,
          name: selectedFolder.name,
          type: "folder",
          color: selectedFolder.color,
          isStarred: selectedFolder.isStarred,
          createdAt: selectedFolder.createdAt,
          updatedAt: selectedFolder.updatedAt,
        });
        return;
      }
    }
  }, [selectedItems, files, folders]);

  // Preview states
  const [previewItem, setPreviewItem] = useState<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: string;
  } | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loadingPreviewText, setLoadingPreviewText] = useState(false);

  // Keypress listener for ESC to close preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewItem(null);
        setPreviewText(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Warn user before closing/refreshing tab during active upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasActive = uploadQueue.some(item => item.status === "queued" || item.status === "uploading");
      if (uploading && hasActive) {
        e.preventDefault();
        e.returnValue = "Upload in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [uploading, uploadQueue]);

  const handleOpenFilePreview = (file: DBFile) => {
    setPreviewItem({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
    
    const type = file.mimeType.toLowerCase();
    if (type.startsWith("text/") || type.includes("json") || type.includes("javascript")) {
      setLoadingPreviewText(true);
      fetch(`/api/files/${file.id}/download?inline=true`)
        .then((res) => res.text())
        .then((text) => {
          setPreviewText(text);
          setLoadingPreviewText(false);
        })
        .catch((err) => {
          setPreviewText("Failed to load file contents.");
          setLoadingPreviewText(false);
        });
    }
  };

  // Sub-actions modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRelocateModal, setShowRelocateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);

  // Invite collaborator form states
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");

  // Relocate form states
  const [targetAccountId, setTargetAccountId] = useState("");

  // Share form states
  const [sharePassword, setSharePassword] = useState("");
  const [shareExpiresAt, setShareExpiresAt] = useState("");
  const [shareMaxDownloads, setShareMaxDownloads] = useState("");
  const [generatedShareUrl, setGeneratedShareUrl] = useState("");

  // Rename action states
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renamingItem, setRenamingItem] = useState<{ id: string; name: string; type: "file" | "folder" } | null>(null);

  // Move action states
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [destinationFolderId, setDestinationFolderId] = useState<string>("root");
  const [allFolders, setAllFolders] = useState<any[]>([]);
  const [movingItem, setMovingItem] = useState<{ id: string; name: string; type: "file" | "folder" } | null>(null);

  // Status Alerts
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncStorage = async () => {
    setSyncing(true);
    setAlert(null);
    try {
      const res = await fetch("/api/storage/sync", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      // Generate a detailed success message
      const summaries = data.results.map((r: any) => {
        if (r.error) {
          return `${r.displayName}: Error (${r.error})`;
        }
        return `${r.displayName}: +${r.created} new, ~${r.updated} updated, -${r.deleted} removed`;
      }).join(", ");

      setAlert({
        type: "success",
        message: `Sync completed: ${summaries || "No storage accounts found."}`,
      });
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const loadAllFolders = async () => {
    try {
      const res = await fetch("/api/folders?all=true");
      const data = await res.json();
      setAllFolders(data.folders || []);
    } catch (err) {
      console.error("Failed to load folders list for move", err);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !renameName.trim()) return;
    setActionLoading(true);
    setAlert(null);
    try {
      const route = renamingItem.type === "file" 
        ? `/api/files/${renamingItem.id}` 
        : `/api/folders/${renamingItem.id}`;
      const res = await fetch(route, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename item");

      setAlert({ type: "success", message: `Successfully renamed to "${renameName}"` });
      setShowRenameModal(false);
      setRenamingItem(null);
      setRenameName("");
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingItem) return;
    setActionLoading(true);
    setAlert(null);
    try {
      const route = movingItem.type === "file" 
        ? `/api/files/${movingItem.id}` 
        : `/api/folders/${movingItem.id}`;
      
      const destId = destinationFolderId === "root" ? null : destinationFolderId;
      const body = movingItem.type === "file" 
        ? { folderId: destId } 
        : { parentId: destId };

      const res = await fetch(route, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to move item");

      setAlert({ type: "success", message: `Successfully moved "${movingItem.name}"` });
      setShowMoveModal(false);
      setMovingItem(null);
      setDestinationFolderId("root");
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const getFileIconClass = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'fa-solid fa-file-image text-emerald-500';
    if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return 'fa-solid fa-file-video text-amber-500';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'fa-solid fa-file-audio text-teal-500';
    if (['pdf'].includes(ext)) return 'fa-solid fa-file-pdf text-rose-500';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-solid fa-file-zipper text-purple-500';
    if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'fa-solid fa-file-lines text-blue-500';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-solid fa-file-excel text-green-600';
    return 'fa-solid fa-file text-slate-400';
  };

  const handleCopyFile = async (fileItem: { id: string; name: string }) => {
    setActionLoading(true);
    setAlert(null);
    try {
      const res = await fetch(`/api/files/${fileItem.id}/copy`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to copy file");

      setAlert({ type: "success", message: `Created copy of "${fileItem.name}"` });
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  interface UploadTask {
    file: File;
    relativePath: string;
  }

  const traverseFileTree = (entry: any, path: string = ""): Promise<UploadTask[]> => {
    return new Promise((resolve) => {
      const tasks: UploadTask[] = [];
      if (entry.isFile) {
        entry.file(
          (file: File) => {
            tasks.push({ file, relativePath: path + file.name });
            resolve(tasks);
          },
          () => {
            resolve([]);
          }
        );
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        let allEntries: any[] = [];
        const readEntries = () => {
          dirReader.readEntries(
            async (results: any[]) => {
              if (results.length === 0) {
                const subPromises = allEntries.map((subEntry) =>
                  traverseFileTree(subEntry, path + entry.name + "/")
                );
                const subResults = await Promise.all(subPromises);
                resolve(subResults.flat());
              } else {
                allEntries = allEntries.concat(results);
                readEntries();
              }
            },
            () => {
              resolve([]);
            }
          );
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  };

  const uploadFileWithProgress = (
    formData: FormData,
    onProgress: (percent: number) => void
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (_) {
            resolve(xhr.responseText);
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  };

  const updateQueueItemProgress = (
    id: string,
    progress: number,
    status: "queued" | "uploading" | "completed" | "failed"
  ) => {
    setUploadQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, progress, status } : item))
    );
  };

  const executeUploadTasks = async (tasks: UploadTask[]) => {
    const queueItems: UploadQueueItem[] = tasks.map((t, idx) => ({
      id: `task_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      name: t.file.name,
      relativePath: t.relativePath,
      status: "queued" as const,
      progress: 0,
      size: t.file.size,
    }));

    setUploadQueue(queueItems);
    setIsWidgetExpanded(true);

    const folderCache = new Map<string, string>();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const queueId = queueItems[i].id;

      updateQueueItemProgress(queueId, 0, "uploading");

      let targetFolderId = currentFolderId;
      const parts = task.relativePath.split("/");
      const dirParts = parts.slice(0, -1);

      if (dirParts.length > 0) {
        let currentParentId = currentFolderId;
        let accumulatedPath = "";

        for (const folderName of dirParts) {
          accumulatedPath += (accumulatedPath ? "/" : "") + folderName;
          const cacheKey = `${currentParentId || "root"}/${accumulatedPath}`;

          if (folderCache.has(cacheKey)) {
            currentParentId = folderCache.get(cacheKey) || null;
          } else {
            const existingFolder = folders.find(
              (f) => f.name === folderName && (f.parentId === currentParentId || (!f.parentId && !currentParentId))
            );

            if (existingFolder) {
              folderCache.set(cacheKey, existingFolder.id);
              currentParentId = existingFolder.id;
            } else {
              try {
                const res = await fetch("/api/folders", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: folderName, parentId: currentParentId }),
                });
                if (!res.ok) {
                  throw new Error("Failed to create parent folder");
                }
                const data = await res.json();
                const newFolderId = data.folder.id;
                folderCache.set(cacheKey, newFolderId);
                currentParentId = newFolderId;
              } catch (err) {
                console.error("Error creating folder structure dynamically:", err);
                break;
              }
            }
          }
        }
        targetFolderId = currentParentId;
      }

      const formData = new FormData();
      formData.append("file", task.file);
      if (targetFolderId) {
        formData.append("folderId", targetFolderId);
      }

      try {
        await uploadFileWithProgress(formData, (percent) => {
          updateQueueItemProgress(queueId, percent, "uploading");
        });
        updateQueueItemProgress(queueId, 100, "completed");
      } catch (err) {
        console.error("Upload failed for item:", task.relativePath, err);
        updateQueueItemProgress(queueId, 0, "failed");
      }
    }

    loadDirectoryContents(currentFolderId);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;

    const tasks: UploadTask[] = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      tasks.push({ file, relativePath: file.name });
    }

    setUploading(true);
    await executeUploadTasks(tasks);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const traversalPromises: Promise<UploadTask[]>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          traversalPromises.push(traverseFileTree(entry));
        }
      }
    }

    setUploading(true);

    let allTasks: UploadTask[] = [];
    try {
      const results = await Promise.all(traversalPromises);
      allTasks = results.flat();
    } catch (err) {
      console.error("Error reading dropped items:", err);
      setUploading(false);
      return;
    }

    if (allTasks.length === 0) {
      setUploading(false);
      return;
    }

    await executeUploadTasks(allTasks);
  };

  // Load content
  const loadDirectoryContents = async (folderId: string | null) => {
    setLoading(true);
    try {
      const fResponse = await fetch(`/api/folders?parentId=${folderId || ""}`);
      const foldersData = await fResponse.json();
      setFolders(foldersData.folders || []);
      if (foldersData.breadcrumbs) {
        setBreadcrumbs(foldersData.breadcrumbs);
      }

      const fileResponse = await fetch(`/api/files?folderId=${folderId || ""}`);
      const filesData = await fileResponse.json();
      setFiles(filesData.files || []);


    } catch (err) {
      console.error("Failed to load directory contents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isRestored) return;
    loadDirectoryContents(currentFolderId);
  }, [currentFolderId, isRestored]);

  const loadConnectedAccounts = async () => {
    try {
      const res = await fetch("/api/storage/summary");
      const data = await res.json();
      setConnectedAccounts(data.accounts || []);
    } catch (err) {
      console.error("Failed to load connected accounts", err);
    }
  };

  const handleFolderClick = (folder: DBFolder) => {
    router.push(`/all-files?folderId=${folder.id}`);
  };

  const handleBreadcrumbClick = (index: number) => {
    const item = breadcrumbs[index];
    if (item.id) {
      router.push(`/all-files?folderId=${item.id}`);
    } else {
      router.push(`/all-files`);
    }
  };

  // Filters & Sorting States
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");

  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);

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

  const toggleSelect = (id: string) => {
    setIsSelectionMode(true);
    const newSelects = new Set(selectedItems);
    if (newSelects.has(id)) newSelects.delete(id);
    else newSelects.add(id);
    setSelectedItems(newSelects);
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
    setIsSelectionMode(false);
  };

  const formatSize = (bytesStr: string) => {
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes) || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName, parentId: currentFolderId }),
      });
      setNewFolderName("");
      setShowCreateFolderModal(false);
      loadDirectoryContents(currentFolderId);
    } catch (_) {
      console.error("Failed to create folder");
    }
  };

  // Actions implementations
  const handleToggleStar = async (itemOverride?: { id: string; name: string; type: "file" | "folder"; isStarred?: boolean }) => {
    const item = itemOverride || activeItem;
    if (!item) return;
    try {
      const route = item.type === "file" 
        ? `/api/files/${item.id}/star` 
        : `/api/folders/${item.id}/star`;
      const res = await fetch(route, { method: "POST" });
      if (!res.ok) throw new Error("Failed to update favorite status");
      
      setAlert({ type: "success", message: `Updated favorite status for ${item.name}` });
      if (detailsItem && detailsItem.id === item.id) {
        setDetailsItem({ ...detailsItem, isStarred: !detailsItem.isStarred });
      }
      loadDirectoryContents(currentFolderId);
      setShowActionsModal(false);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    }
  };

  const handleSoftDelete = async (itemOverride?: { id: string; name: string; type: "file" | "folder" }) => {
    const item = itemOverride || activeItem;
    if (!item) return;
    if (!confirm(`Move "${item.name}" to Trash?`)) return;
    try {
      const route = item.type === "file" 
        ? `/api/files/${item.id}` 
        : `/api/folders/${item.id}`;
      const res = await fetch(route, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete item");
      
      setAlert({ type: "success", message: `"${item.name}" moved to Trash.` });
      if (detailsItem && detailsItem.id === item.id) {
        setShowDetailsSidebar(false);
        setDetailsItem(null);
      }
      loadDirectoryContents(currentFolderId);
      setShowActionsModal(false);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    }
  };

  const handleExtractZip = async (itemOverride?: { id: string; name: string; type: "file" }) => {
    const item = itemOverride || activeItem;
    if (!item) return;
    setActionLoading(true);
    setAlert(null);
    try {
      const res = await fetch(`/api/files/${item.id}/unzip`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      
      setAlert({ type: "success", message: data.message });
      loadDirectoryContents(currentFolderId);
      setShowActionsModal(false);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    setActionLoading(true);
    setAlert(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          targetType: activeItem.type,
          targetId: activeItem.id,
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite collaborator");

      setAlert({ type: "success", message: data.message });
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("viewer");
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRelocateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    if (!targetAccountId) {
      window.alert("Please select a destination storage node.");
      return;
    }
    setActionLoading(true);
    setAlert(null);
    try {
      const res = await fetch(`/api/files/${activeItem.id}/relocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Migration failed");

      setAlert({ type: "success", message: data.message });
      setShowRelocateModal(false);
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePublicShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    setActionLoading(true);
    setAlert(null);
    setGeneratedShareUrl("");
    try {
      const url = activeItem.type === "folder" 
        ? `/api/folders/${activeItem.id}/share`
        : `/api/files/${activeItem.id}/share`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: sharePassword || undefined,
          expiresAt: shareExpiresAt || undefined,
          maxDownloads: shareMaxDownloads || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create public share link");

      setGeneratedShareUrl(data.url);
      setAlert({ type: "success", message: "Share link generated successfully!" });
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchDownload = async (singleFolderId?: string) => {
    const fileIds: string[] = [];
    const folderIds: string[] = [];

    let targetLabel = "";

    if (singleFolderId) {
      folderIds.push(singleFolderId);
      const folderObj = folders.find(f => f.id === singleFolderId);
      targetLabel = folderObj ? `Folder: ${folderObj.name}` : "selected folder";
    } else {
      if (selectedItems.size === 0) return;
      selectedItems.forEach((id) => {
        const isFolder = folders.some((f) => f.id === id);
        if (isFolder) {
          folderIds.push(id);
        } else {
          fileIds.push(id);
        }
      });
      targetLabel = `${fileIds.length + folderIds.length} items`;
    }

    setActionLoading(true);
    setAlert(null);
    setDownloadStatus("preparing");
    setDownloadProgressText(`Zipping ${targetLabel}...`);

    try {
      const res = await fetch("/api/batch/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate download archive");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = singleFolderId 
        ? `${folders.find(f => f.id === singleFolderId)?.name || "folder"}.zip` 
        : "clospol-download.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setDownloadStatus("ready");
      setDownloadProgressText("Download archive generated!");
      setTimeout(() => {
        setDownloadStatus("idle");
      }, 3000);

      setAlert({ type: "success", message: "Download archive generated successfully." });
    } catch (err: any) {
      console.error("Batch download error:", err);
      setDownloadStatus("failed");
      setDownloadProgressText(err.message || "Failed to archive files.");
      setAlert({ type: "error", message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectAll = () => {
    setIsSelectionMode(true);
    const allFilteredIds = [
      ...folders.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((f) => f.id),
      ...files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((f) => f.id),
    ];
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedItems.has(id));
    if (allSelected) {
      const newSelects = new Set(selectedItems);
      allFilteredIds.forEach((id) => newSelects.delete(id));
      setSelectedItems(newSelects);
    } else {
      const newSelects = new Set(selectedItems);
      allFilteredIds.forEach((id) => newSelects.add(id));
      setSelectedItems(newSelects);
    }
  };

  const handleBatchStar = async (star: boolean) => {
    if (selectedItems.size === 0) return;
    const selectedIds = Array.from(selectedItems);
    const fileIds = files.filter((f) => selectedIds.includes(f.id)).map((f) => f.id);
    const folderIds = folders.filter((f) => selectedIds.includes(f.id)).map((f) => f.id);
    if (fileIds.length === 0 && folderIds.length === 0) return;
    try {
      const res = await fetch("/api/batch/star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderIds, star }),
      });
      if (!res.ok) throw new Error("Failed to update favorite status for selected items");
      setAlert({ type: "success", message: `Updated favorites status for ${selectedIds.length} items.` });
      if (detailsItem && selectedIds.includes(detailsItem.id)) {
        setDetailsItem({ ...detailsItem, isStarred: star });
      }
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Move the ${selectedItems.size} selected items to Trash?`)) return;
    const selectedIds = Array.from(selectedItems);
    const fileIds = files.filter((f) => selectedIds.includes(f.id)).map((f) => f.id);
    const folderIds = folders.filter((f) => selectedIds.includes(f.id)).map((f) => f.id);
    if (fileIds.length === 0 && folderIds.length === 0) return;
    try {
      const res = await fetch("/api/batch/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds, folderIds }),
      });
      if (!res.ok) throw new Error("Failed to move selected items to Trash");
      setAlert({ type: "success", message: `Moved ${selectedIds.length} items to Trash.` });
      if (detailsItem && selectedIds.includes(detailsItem.id)) {
        setShowDetailsSidebar(false);
        setDetailsItem(null);
      }
      handleClearSelection();
      loadDirectoryContents(currentFolderId);
    } catch (err: any) {
      setAlert({ type: "error", message: err.message });
    }
  };

  const getSortedFolders = () => {
    let list = folders.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // If any file-only filters are active, folders shouldn't be displayed
    if (filterType !== "all" || filterProvider !== "all" || filterDate !== "all") {
      return [];
    }

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
    let list = files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

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

    // Sort files
    return list.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
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

  const filteredFolders = getSortedFolders();
  const filteredFiles = getSortedFiles();

  return (
    <SidebarLayout>
      <div 
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex gap-6 items-start relative h-full w-full min-h-[80vh]"
      >
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-8">
          
          {/* Action Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Files Console</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage virtual folders and access linked multi-cloud files.</p>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowCreateFolderModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold shadow-sm transition cursor-pointer"
              >
                <i className="fa-solid fa-plus"></i>
                New Folder
              </button>

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                multiple 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold tracking-wide shadow-lg shadow-blue-500/10 transition-all duration-200 cursor-pointer"
              >
                <i className="fa-solid fa-plus"></i>
                Upload Files
              </button>
            </div>
          </div>

          {alert && (
            <div className={`p-4 rounded-2xl flex items-start gap-3 border ${
              alert.type === "success" 
                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300" 
                : "bg-rose-950/40 border-rose-800/60 text-rose-300"
            }`}>
              {alert.type === "success" ? <i className="fa-solid fa-circle-check mt-0.5"></i> : <i className="fa-solid fa-circle-exclamation mt-0.5"></i>}
              <div className="flex-1 text-xs font-semibold">{alert.message}</div>
              <button onClick={() => setAlert(null)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          )}

          {/* Google Drive style Selection Header overlay */}
          {selectedItems.size > 0 ? (
            <div className="flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-2xl px-5 py-3.5 animate-in fade-in duration-200 shadow-sm">
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleClearSelection}
                  className="p-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition cursor-pointer"
                  title="Clear Selection"
                >
                  <i className="fa-solid fa-xmark text-lg"></i>
                </button>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedItems.size} selected</span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-705 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold transition cursor-pointer bg-white dark:bg-slate-900"
                >
                  <i className="fa-solid fa-list-check"></i>
                  Select All
                </button>
                
                <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

                <button
                  onClick={() => handleBatchStar(true)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-amber-500 dark:text-slate-400 dark:hover:text-amber-400 transition cursor-pointer"
                  title="Star Selected"
                >
                  <i className="fa-solid fa-star text-base text-amber-400"></i>
                </button>

                <button
                  onClick={() => handleBatchStar(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
                  title="Unstar Selected"
                >
                  <i className="fa-regular fa-star text-base"></i>
                </button>

                {selectedItems.size === 1 && (
                  <button
                    onClick={() => {
                      const id = Array.from(selectedItems)[0];
                      const file = files.find(f => f.id === id);
                      if (file) {
                        setActiveItem({ id: file.id, name: file.name, type: "file", provider: file.provider, mimeType: file.mimeType, isStarred: file.isStarred, connectedAccountId: file.connectedAccountId });
                        loadConnectedAccounts();
                        setShowRelocateModal(true);
                      }
                    }}
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition cursor-pointer"
                    title="Relocate"
                  >
                    <i className="fa-solid fa-compass text-base"></i>
                  </button>
                )}

                <button
                  onClick={() => handleBatchDownload()}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 transition cursor-pointer"
                  title="Download Selected as ZIP"
                >
                  <i className="fa-solid fa-download text-base"></i>
                </button>

                <button
                  onClick={handleBatchDelete}
                  className="p-2 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-950/20 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition cursor-pointer"
                  title="Move to Trash"
                >
                  <i className="fa-solid fa-trash-can text-base"></i>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar controls */}
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between glass-panel p-4 rounded-2xl">
                {/* Search */}
                <div className="relative w-full sm:max-w-xs">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
                  <input 
                    type="text" 
                    placeholder="Search workspace files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl text-sm glass-input"
                  />
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button 
                    onClick={() => {
                      const nextMode = !isSelectionMode;
                      setIsSelectionMode(nextMode);
                      if (!nextMode) {
                        setSelectedItems(new Set());
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border transition-all cursor-pointer text-xs font-bold ${
                      isSelectionMode 
                        ? "bg-blue-600/10 border-blue-500/30 text-blue-500" 
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-705 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                    title="Toggle Multi-Select Mode"
                  >
                    <i className="fa-solid fa-square-check"></i>
                    {isSelectionMode ? "Multi-Select On" : "Multi-Select Off"}
                  </button>

                  {isSelectionMode && (
                    <button 
                      onClick={handleSelectAll}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-705 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold shadow-xs transition cursor-pointer"
                      title="Select All / Deselect All"
                    >
                      <i className="fa-solid fa-list-check"></i>
                      Select All
                    </button>
                  )}

                  <button 
                    onClick={() => {
                      if (!detailsItem) {
                        const firstItem = filteredFolders[0] 
                          ? { id: filteredFolders[0].id, name: filteredFolders[0].name, type: "folder" as const, isStarred: filteredFolders[0].isStarred, createdAt: filteredFolders[0].createdAt, updatedAt: filteredFolders[0].updatedAt }
                          : filteredFiles[0] 
                            ? { id: filteredFiles[0].id, name: filteredFiles[0].name, type: "file" as const, provider: filteredFiles[0].provider, mimeType: filteredFiles[0].mimeType, sizeBytes: filteredFiles[0].sizeBytes, isStarred: filteredFiles[0].isStarred, createdAt: filteredFiles[0].createdAt, connectedAccountId: filteredFiles[0].connectedAccountId }
                            : null;
                        if (firstItem) setDetailsItem(firstItem);
                      }
                      setShowDetailsSidebar(!showDetailsSidebar);
                    }}
                    className={`p-2 rounded-xl border transition-colors cursor-pointer ${showDetailsSidebar ? "bg-blue-600/10 border-blue-500/30 text-blue-500" : "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"}`}
                    title="Toggle Details Panel"
                  >
                    <i className="fa-solid fa-circle-info"></i>
                  </button>

                   <button 
                    onClick={handleSyncStorage}
                    disabled={syncing}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer disabled:opacity-50"
                    title="Sync Storage (Google Drive / S3 / Local)"
                  >
                    <i className={`fa-solid fa-cloud-arrow-down ${syncing ? "animate-bounce" : ""}`}></i>
                  </button>

                  <button 
                    onClick={() => loadDirectoryContents(currentFolderId)}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                    title="Refresh Files"
                  >
                    <i className={`fa-solid fa-arrows-rotate ${loading ? "animate-spin" : ""}`}></i>
                  </button>

                  <div className="h-5 w-[1px] bg-slate-202 dark:bg-slate-800"></div>

                  <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-900/40">
                    <button 
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === "grid" ? "bg-white dark:bg-slate-800 text-blue-500 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                    >
                      <i className="fa-solid fa-table-cells-large"></i>
                    </button>
                    <button 
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === "list" ? "bg-white dark:bg-slate-800 text-blue-500 dark:text-blue-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                    >
                      <i className="fa-solid fa-list"></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* Breadcrumb navigator */}
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-400 px-2 overflow-x-auto whitespace-nowrap">
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id || "root"}>
                    {idx > 0 && <i className="fa-solid fa-chevron-right text-slate-600 flex-shrink-0"></i>}
                    <button 
                      onClick={() => handleBreadcrumbClick(idx)}
                      className={`hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer ${idx === breadcrumbs.length - 1 ? "text-slate-800 dark:text-slate-200 font-semibold" : ""}`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Filter & Sort Chips Row */}
              <div className="flex flex-wrap items-center gap-2.5 px-2 py-1 text-xs">
                {/* Sort Dropdown */}
                <div className="relative" ref={sortDropdownRef}>
                  <button 
                    onClick={() => {
                      setShowSortDropdown(!showSortDropdown);
                      setShowTypeDropdown(false);
                      setShowProviderDropdown(false);
                      setShowDateDropdown(false);
                    }} 
                    className="flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer" 
                    title="Sort Items"
                  >
                    <i className="fa-solid fa-arrow-down-wide-short text-[10px]"></i>
                    <span>Sort</span>
                  </button>
                  {showSortDropdown && (
                    <div className="absolute left-0 z-40 mt-1.5 w-48 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
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
                      setShowProviderDropdown(false);
                      setShowDateDropdown(false);
                    }} 
                    className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                      filterType !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
                    }`}
                  >
                    <span>Type</span>
                    {filterType !== "all" && <span className="font-extrabold uppercase text-[10px]">: {filterType}</span>}
                    <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
                  </button>
                  {showTypeDropdown && (
                    <div className="absolute left-0 z-40 mt-1.5 w-40 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
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
                    onClick={() => {
                      setShowProviderDropdown(!showProviderDropdown);
                      setShowSortDropdown(false);
                      setShowTypeDropdown(false);
                      setShowDateDropdown(false);
                    }} 
                    className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                      filterProvider !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
                    }`}
                  >
                    <span>Storage</span>
                    {filterProvider !== "all" && <span className="font-extrabold uppercase text-[10px]">: {filterProvider.replace("_", " ")}</span>}
                    <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
                  </button>
                  {showProviderDropdown && (
                    <div className="absolute left-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                      {[
                        { label: "All Accounts", val: "all" },
                        { label: "Google Drive", val: "google_drive" },
                        { label: "S3 Storage", val: "s3" },
                        { label: "Local Storage", val: "local" }
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
                    onClick={() => {
                      setShowDateDropdown(!showDateDropdown);
                      setShowSortDropdown(false);
                      setShowTypeDropdown(false);
                      setShowProviderDropdown(false);
                    }} 
                    className={`flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer ${
                      filterDate !== "all" ? "border-blue-500 bg-blue-50/20 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" : ""
                    }`}
                  >
                    <span>Last Modified</span>
                    {filterDate !== "all" && <span className="font-extrabold uppercase text-[10px]">: {filterDate}</span>}
                    <i className="fa-solid fa-chevron-down text-[10px] opacity-60"></i>
                  </button>
                  {showDateDropdown && (
                    <div className="absolute left-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
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
                {(filterType !== "all" || filterProvider !== "all" || filterDate !== "all" || sortBy !== "name_asc") && (
                  <button 
                    onClick={() => { setFilterType("all"); setFilterProvider("all"); setFilterDate("all"); setSortBy("name_asc"); }} 
                    className="flex h-8 items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-3 font-semibold text-slate-600 dark:text-slate-400 transition cursor-pointer"
                  >
                    <span>Reset Filters</span>
                    <i className="fa-solid fa-xmark text-[10px]"></i>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Folder / File Grid View */}
          {viewMode === "grid" ? (
            <div className="space-y-8">
              {/* Folders block */}
              {filteredFolders.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-4 px-2">Folders</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredFolders.map((folder) => {
                      const isSelected = selectedItems.has(folder.id);
                      return (
                        <div 
                          key={folder.id} 
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleSelect(folder.id);
                            } else {
                              setDetailsItem({
                                id: folder.id,
                                name: folder.name,
                                type: "folder",
                                color: folder.color,
                                isStarred: folder.isStarred,
                                createdAt: folder.createdAt,
                                updatedAt: folder.updatedAt,
                              });
                              setShowDetailsSidebar(true);
                            }
                          }}
                          onDoubleClick={() => handleFolderClick(folder)}
                          className={`
                            glass-panel p-4.5 rounded-2xl flex items-center justify-between cursor-pointer select-none relative transition-all duration-300 group
                            ${isSelected ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/15 shadow-lg shadow-blue-500/5" : "glass-panel-hover bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800"}
                          `}
                        >
                          <div className="flex items-center gap-3.5 overflow-hidden">
                            <div className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100/80 dark:bg-slate-800/80">
                              {/* Normal folder icon */}
                              <i className={`fa-solid fa-folder text-xl transition-all duration-200 ${
                                isSelectionMode 
                                  ? (isSelected ? "opacity-0 scale-75" : "group-hover:opacity-0 group-hover:scale-75") 
                                  : ""
                              }`} style={{ color: folder.color }}></i>
                              
                              {/* Selection checkbox overlay */}
                              {isSelectionMode && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelect(folder.id);
                                  }}
                                  className={`absolute inset-0 rounded-xl flex items-center justify-center border transition-all duration-200 ${
                                    isSelected 
                                      ? "bg-blue-600 border-blue-600 text-white opacity-100 scale-100" 
                                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 hover:border-blue-500"
                                  }`}
                                >
                                  <i className="fa-solid fa-check text-[11px] font-bold"></i>
                                </div>
                              )}
                            </div>
                            <span className="font-semibold text-sm truncate text-slate-800 dark:text-slate-200">{folder.name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const item = { id: folder.id, name: folder.name, type: "folder" as const, isStarred: folder.isStarred };
                                handleToggleStar(item);
                              }}
                              className="p-1 text-slate-400 hover:text-amber-500 dark:text-slate-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
                              title={folder.isStarred ? "Remove from Favorites" : "Add to Favorites"}
                            >
                              <i className={`${folder.isStarred ? "fa-solid fa-star text-amber-400" : "fa-regular fa-star text-slate-400 dark:text-slate-600"}`}></i>
                            </button>
                            <div className="relative">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (menuOpenItemId === folder.id) {
                                    setMenuOpenItemId(null);
                                  } else {
                                    setMenuOpenItemId(folder.id);
                                    setActiveItem({ id: folder.id, name: folder.name, type: "folder", isStarred: folder.isStarred });
                                  }
                                }}
                                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1 cursor-pointer"
                              >
                                <i className="fa-solid fa-ellipsis-vertical"></i>
                              </button>

                              {menuOpenItemId === folder.id && (
                                <>
                                  <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMenuOpenItemId(null); }} />
                                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150 text-slate-700 dark:text-slate-200">
                                    <div className="px-3 py-1 border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate mb-1">
                                      Folder Actions
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        setDetailsItem({
                                          id: folder.id,
                                          name: folder.name,
                                          type: "folder",
                                          color: folder.color,
                                          isStarred: folder.isStarred,
                                          createdAt: folder.createdAt,
                                          updatedAt: folder.updatedAt,
                                        });
                                        setShowDetailsSidebar(true);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                    >
                                      <i className="fa-solid fa-circle-info text-blue-500 w-4"></i>
                                      View Details
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        const item = { id: folder.id, name: folder.name, type: "folder" as const, isStarred: folder.isStarred };
                                        handleToggleStar(item);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                    >
                                      <i className={`fa-solid fa-star w-4 ${folder.isStarred ? "text-amber-400" : "text-slate-400"}`}></i>
                                      {folder.isStarred ? "Remove from Favorites" : "Add to Favorites"}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        setActiveItem({ id: folder.id, name: folder.name, type: "folder", isStarred: folder.isStarred });
                                         setGeneratedShareUrl("");
                                         setSharePassword("");
                                         setShareExpiresAt("");
                                         setShareMaxDownloads("");
                                         setShowShareModal(true);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                    >
                                       <i className="fa-solid fa-share-nodes text-indigo-400 w-4"></i>
                                       Generate Share Link
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        handleBatchDownload(folder.id);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                    >
                                       <i className="fa-solid fa-download text-emerald-500 w-4"></i>
                                       Download Folder (ZIP)
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        setRenamingItem({ id: folder.id, name: folder.name, type: "folder" });
                                        setRenameName(folder.name);
                                        setShowRenameModal(true);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                    >
                                      <i className="fa-solid fa-pen text-blue-500 w-4"></i>
                                      Rename Folder
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        setMovingItem({ id: folder.id, name: folder.name, type: "folder" });
                                        setDestinationFolderId(folder.parentId || "root");
                                        loadAllFolders();
                                        setShowMoveModal(true);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                    >
                                      <i className="fa-solid fa-folder-open text-orange-500 w-4"></i>
                                      Move Folder
                                    </button>
                                    <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenItemId(null);
                                        const item = { id: folder.id, name: folder.name, type: "folder" as const, isStarred: folder.isStarred };
                                        handleSoftDelete(item);
                                      }}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-left transition cursor-pointer"
                                    >
                                      <i className="fa-solid fa-trash-can w-4"></i>
                                      Move to Trash
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Files block */}
              {filteredFiles.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase mb-4 px-2">Files</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredFiles.map((file) => {
                      const isSelected = selectedItems.has(file.id);
                      return (
                        <div 
                          key={file.id} 
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleSelect(file.id);
                            } else {
                              setDetailsItem({
                                id: file.id,
                                name: file.name,
                                type: "file",
                                provider: file.provider,
                                mimeType: file.mimeType,
                                sizeBytes: file.sizeBytes,
                                isStarred: file.isStarred,
                                createdAt: file.createdAt,
                                updatedAt: file.createdAt,
                                connectedAccountId: file.connectedAccountId,
                              });
                              setShowDetailsSidebar(true);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleOpenFilePreview(file);
                          }}
                          className={`
                            glass-panel p-4.5 rounded-2xl flex flex-col justify-between h-44 cursor-pointer select-none transition-all duration-300 relative group
                            ${isSelected ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/15 shadow-lg shadow-blue-500/5" : "glass-panel-hover bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800"}
                          `}
                        >
                          <div className="flex items-start justify-between">
                            <div className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {/* Normal file icon */}
                              <i className={`fa-solid fa-file text-slate-500 dark:text-slate-400 transition-all duration-200 ${
                                isSelectionMode 
                                  ? (isSelected ? "opacity-0 scale-75" : "group-hover:opacity-0 group-hover:scale-75") 
                                  : ""
                              }`}></i>
                              
                              {/* Selection checkbox overlay */}
                              {isSelectionMode && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSelect(file.id);
                                  }}
                                  className={`absolute inset-0 rounded-xl flex items-center justify-center border transition-all duration-200 ${
                                    isSelected 
                                      ? "bg-blue-600 border-blue-600 text-white opacity-100 scale-100" 
                                      : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 hover:border-blue-500"
                                  }`}
                                >
                                  <i className="fa-solid fa-check text-[11px] font-bold"></i>
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              {file.provider}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 overflow-hidden">
                            <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate leading-snug">{file.name}</p>
                            <span className="text-[10px] text-slate-500 font-semibold">{formatSize(file.sizeBytes)}</span>
                          </div>

                          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 mt-3 flex items-center justify-between text-slate-500 text-xs">
                            <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const item = { id: file.id, name: file.name, type: "file" as const, isStarred: file.isStarred };
                                  handleToggleStar(item);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-500 dark:text-slate-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
                                title={file.isStarred ? "Remove from Favorites" : "Add to Favorites"}
                              >
                                <i className={`${file.isStarred ? "fa-solid fa-star text-amber-400" : "fa-regular fa-star text-slate-400 dark:text-slate-600"}`}></i>
                              </button>
                              <div className="relative">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (menuOpenItemId === file.id) {
                                      setMenuOpenItemId(null);
                                    } else {
                                      setMenuOpenItemId(file.id);
                                      setActiveItem({ 
                                        id: file.id, 
                                        name: file.name, 
                                        type: "file", 
                                        provider: file.provider, 
                                        mimeType: file.mimeType,
                                        isStarred: file.isStarred,
                                        connectedAccountId: file.connectedAccountId 
                                      });
                                    }
                                  }}
                                  className="hover:text-slate-700 dark:hover:text-slate-300 p-1 cursor-pointer"
                                >
                                  <i className="fa-solid fa-ellipsis-vertical"></i>
                                </button>

                                {menuOpenItemId === file.id && (
                                  <>
                                    <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMenuOpenItemId(null); }} />
                                    <div className="absolute right-0 bottom-full mb-1.5 w-56 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150 text-slate-700 dark:text-slate-200">
                                      <div className="px-3 py-1 border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate mb-1">
                                        File Actions
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          setDetailsItem({
                                            id: file.id,
                                            name: file.name,
                                            type: "file",
                                            provider: file.provider,
                                            mimeType: file.mimeType,
                                            sizeBytes: file.sizeBytes,
                                            isStarred: file.isStarred,
                                            createdAt: file.createdAt,
                                            updatedAt: file.createdAt,
                                            connectedAccountId: file.connectedAccountId
                                          });
                                          setShowDetailsSidebar(true);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-circle-info text-blue-500 w-4"></i>
                                        View Details
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          const item = { id: file.id, name: file.name, type: "file" as const, isStarred: file.isStarred };
                                          handleToggleStar(item);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className={`fa-solid fa-star w-4 ${file.isStarred ? "text-amber-400" : "text-slate-400"}`}></i>
                                        {file.isStarred ? "Remove from Favorites" : "Add to Favorites"}
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          setActiveItem({ 
                                            id: file.id, 
                                            name: file.name, 
                                            type: "file", 
                                            provider: file.provider, 
                                            mimeType: file.mimeType,
                                            isStarred: file.isStarred,
                                            connectedAccountId: file.connectedAccountId 
                                          });
                                          setGeneratedShareUrl("");
                                          setSharePassword("");
                                          setShareExpiresAt("");
                                          setShareMaxDownloads("");
                                          setShowShareModal(true);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-share-nodes text-indigo-400 w-4"></i>
                                        Generate Share Link
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          setActiveItem({ 
                                            id: file.id, 
                                            name: file.name, 
                                            type: "file", 
                                            provider: file.provider, 
                                            mimeType: file.mimeType,
                                            isStarred: file.isStarred,
                                            connectedAccountId: file.connectedAccountId 
                                          });
                                          loadConnectedAccounts();
                                          setShowRelocateModal(true);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-compass text-amber-400 w-4"></i>
                                        Relocate Storage
                                      </button>
                                      {(file.name.toLowerCase().endsWith(".zip") || file.mimeType === "application/zip") && (
                                        <button
                                          disabled={actionLoading}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpenItemId(null);
                                            const item = { id: file.id, name: file.name, type: "file" as const, isStarred: file.isStarred };
                                            handleExtractZip(item);
                                          }}
                                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition disabled:opacity-50 cursor-pointer"
                                        >
                                          <i className="fa-solid fa-box-archive text-emerald-400 w-4"></i>
                                          Extract ZIP
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          setRenamingItem({ id: file.id, name: file.name, type: "file" });
                                          setRenameName(file.name);
                                          setShowRenameModal(true);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-pen text-blue-500 w-4"></i>
                                        Rename File
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          setMovingItem({ id: file.id, name: file.name, type: "file" });
                                          setDestinationFolderId(file.folderId || "root");
                                          loadAllFolders();
                                          setShowMoveModal(true);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-folder-open text-orange-500 w-4"></i>
                                        Move File
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          handleCopyFile({ id: file.id, name: file.name });
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-copy text-emerald-500 w-4"></i>
                                        Make a Copy
                                      </button>
                                      <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMenuOpenItemId(null);
                                          const item = { id: file.id, name: file.name, type: "file" as const, isStarred: file.isStarred };
                                          handleSoftDelete(item);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-left transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-trash-can w-4"></i>
                                        Move to Trash
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredFolders.length === 0 && filteredFiles.length === 0 && !loading && (
                <div className="glass-panel p-16 text-center rounded-2xl flex flex-col items-center justify-center">
                  <i className="fa-solid fa-folder-open text-slate-400 dark:text-slate-600 text-3xl mb-4"></i>
                  <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {searchQuery ? "No search results" : "Folder is Empty"}
                  </h3>
                  <p className="text-sm text-slate-500 max-w-sm">
                    {searchQuery 
                      ? `No files or folders matching "${searchQuery}" found in this directory.` 
                      : 'No subdirectories or files found. Click "Upload Files" or "New Folder" to add data.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* List View */
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      {isSelectionMode && (
                        <th className="py-4 px-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              (filteredFolders.length > 0 || filteredFiles.length > 0) &&
                              filteredFolders.every((f) => selectedItems.has(f.id)) &&
                              filteredFiles.every((f) => selectedItems.has(f.id))
                            }
                            onChange={handleSelectAll}
                            className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="py-4 px-2 w-10"></th>
                      <th className="py-4 px-6">Name</th>
                      <th className="py-4 px-6 hidden sm:table-cell">Provider</th>
                      <th className="py-4 px-6">Size</th>
                      <th className="py-4 px-6 hidden md:table-cell">Last Modified</th>
                      <th className="py-4 px-6 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50 bg-white dark:bg-slate-900/10">
                    {filteredFolders.map((folder) => {
                      const isSelected = selectedItems.has(folder.id);
                      return (
                        <tr 
                          key={folder.id} 
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleSelect(folder.id);
                            } else {
                              setDetailsItem({
                                id: folder.id,
                                name: folder.name,
                                type: "folder",
                                color: folder.color,
                                isStarred: folder.isStarred,
                                createdAt: folder.createdAt,
                                updatedAt: folder.updatedAt,
                              });
                              setShowDetailsSidebar(true);
                            }
                          }}
                          onDoubleClick={() => handleFolderClick(folder)}
                          className={`hover:bg-slate-800/20 transition-colors cursor-pointer select-none ${isSelected ? "bg-blue-500/10 dark:bg-blue-500/15" : ""}`}
                        >
                          {isSelectionMode && (
                            <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(folder.id)}
                                className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-3 px-2">
                            <i className="fa-solid fa-folder text-lg" style={{ color: folder.color }}></i>
                          </td>
                          <td className="py-3 px-6 font-bold text-slate-800 dark:text-slate-200">{folder.name}</td>
                          <td className="py-3 px-6 text-slate-400 dark:text-slate-500 hidden sm:table-cell">—</td>
                          <td className="py-3 px-6 text-slate-500">—</td>
                          <td className="py-3 px-6 text-slate-550 hidden md:table-cell">{new Date(folder.updatedAt).toLocaleDateString()}</td>
                          <td className="py-3 px-6 text-right relative">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const item = { id: folder.id, name: folder.name, type: "folder" as const, isStarred: folder.isStarred };
                                  handleToggleStar(item);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-500 dark:text-slate-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
                                title={folder.isStarred ? "Remove from Favorites" : "Add to Favorites"}
                              >
                                <i className={`${folder.isStarred ? "fa-solid fa-star text-amber-400" : "fa-regular fa-star text-slate-400 dark:text-slate-600"}`}></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingItem({ id: folder.id, name: folder.name, type: "folder" });
                                  setRenameName(folder.name);
                                  setShowRenameModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-705 dark:hover:text-slate-200 transition cursor-pointer"
                                title="Rename Folder"
                              >
                                <i className="fa-solid fa-pen text-sm"></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMovingItem({ id: folder.id, name: folder.name, type: "folder" });
                                  setDestinationFolderId(folder.parentId || "root");
                                  loadAllFolders();
                                  setShowMoveModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-705 dark:hover:text-slate-200 transition cursor-pointer"
                                title="Move Folder"
                              >
                                <i className="fa-solid fa-folder-open text-sm"></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBatchDownload(folder.id);
                                }}
                                className="p-1 text-slate-400 hover:text-emerald-500 transition cursor-pointer"
                                title="Download Folder (ZIP)"
                              >
                                <i className="fa-solid fa-download text-sm"></i>
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (menuOpenItemId === folder.id) {
                                    setMenuOpenItemId(null);
                                  } else {
                                    setMenuOpenItemId(folder.id);
                                    setActiveItem({ id: folder.id, name: folder.name, type: "folder", isStarred: folder.isStarred });
                                  }
                                }}
                                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1 cursor-pointer"
                              >
                                <i className="fa-solid fa-ellipsis-vertical"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredFiles.map((file) => {
                      const isSelected = selectedItems.has(file.id);
                      return (
                        <tr 
                          key={file.id} 
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleSelect(file.id);
                            } else {
                              setDetailsItem({
                                id: file.id,
                                name: file.name,
                                type: "file",
                                provider: file.provider,
                                mimeType: file.mimeType,
                                sizeBytes: file.sizeBytes,
                                isStarred: file.isStarred,
                                createdAt: file.createdAt,
                                updatedAt: file.createdAt,
                                connectedAccountId: file.connectedAccountId,
                              });
                              setShowDetailsSidebar(true);
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleOpenFilePreview(file);
                          }}
                          className={`hover:bg-slate-800/20 transition-colors cursor-pointer select-none ${isSelected ? "bg-blue-500/10 dark:bg-blue-500/15" : ""}`}
                        >
                          {isSelectionMode && (
                            <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(file.id)}
                                className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-3 px-2">
                            <i className="fa-solid fa-file text-lg text-slate-400"></i>
                          </td>
                          <td className="py-3 px-6 font-bold text-slate-800 dark:text-slate-200">{file.name}</td>
                          <td className="py-3 px-6 hidden sm:table-cell">
                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/40">
                              {file.provider}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-slate-400">{formatSize(file.sizeBytes)}</td>
                          <td className="py-3 px-6 text-slate-400 hidden md:table-cell">{new Date(file.createdAt).toLocaleDateString()}</td>
                          <td className="py-3 px-6 text-right relative">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const item = { id: file.id, name: file.name, type: "file" as const, isStarred: file.isStarred };
                                  handleToggleStar(item);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-500 dark:text-slate-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
                                title={file.isStarred ? "Remove from Favorites" : "Add to Favorites"}
                              >
                                <i className={`${file.isStarred ? "fa-solid fa-star text-amber-400" : "fa-regular fa-star text-slate-400 dark:text-slate-600"}`}></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingItem({ id: file.id, name: file.name, type: "file" });
                                  setRenameName(file.name);
                                  setShowRenameModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-705 dark:hover:text-slate-200 transition cursor-pointer"
                                title="Rename File"
                              >
                                <i className="fa-solid fa-pen text-sm"></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMovingItem({ id: file.id, name: file.name, type: "file" });
                                  setDestinationFolderId(file.folderId || "root");
                                  loadAllFolders();
                                  setShowMoveModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-705 dark:hover:text-slate-200 transition cursor-pointer"
                                title="Move File"
                              >
                                <i className="fa-solid fa-folder-open text-sm"></i>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyFile({ id: file.id, name: file.name });
                                }}
                                className="p-1 text-slate-400 hover:text-slate-705 dark:hover:text-slate-200 transition cursor-pointer"
                                title="Make a Copy"
                              >
                                <i className="fa-solid fa-copy text-sm"></i>
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (menuOpenItemId === file.id) {
                                    setMenuOpenItemId(null);
                                  } else {
                                    setMenuOpenItemId(file.id);
                                    setActiveItem({ 
                                      id: file.id, 
                                      name: file.name, 
                                      type: "file", 
                                      provider: file.provider, 
                                      mimeType: file.mimeType,
                                      isStarred: file.isStarred,
                                      connectedAccountId: file.connectedAccountId 
                                    });
                                  }
                                }}
                                className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
                              >
                                <i className="fa-solid fa-ellipsis-vertical"></i>
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
          )}
        </div>

        {/* Details Sidebar Panel */}
        {showDetailsSidebar && (
          <>
            {/* Mobile Backdrop */}
            <div 
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 lg:hidden"
              onClick={() => setShowDetailsSidebar(false)}
            />
            {/* Sidebar Container */}
            <div className="w-[85vw] sm:w-96 lg:w-80 shrink-0 bg-white dark:bg-slate-900 border-l lg:border border-slate-200 dark:border-slate-800 lg:rounded-3xl p-5.5 shadow-xl lg:shadow-sm space-y-6 fixed lg:sticky right-0 top-0 lg:top-6 bottom-0 z-45 lg:z-10 animate-in slide-in-from-right duration-200 max-h-screen lg:max-h-[calc(100vh-3rem)] overflow-y-auto">
              {detailsItem ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-white">Item Details</h3>
                    <button 
                      onClick={() => setShowDetailsSidebar(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>

                  {/* Preview Box */}
                  <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 bg-blue-500/10 text-blue-500">
                      {detailsItem.type === "folder" ? (
                        <i className="fa-solid fa-folder text-4xl" style={{ color: detailsItem.color || "#3b82f6" }}></i>
                      ) : (
                        <i className="fa-solid fa-file text-4xl text-slate-400"></i>
                      )}
                    </div>
                    <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate w-full text-center px-2" title={detailsItem.name}>
                      {detailsItem.name}
                    </h4>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-200/50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 mt-2">
                      {detailsItem.type}
                    </span>
                  </div>

                  {/* Info fields */}
                  <div className="space-y-3.5 text-xs">
                    <div className="flex justify-between items-start py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 font-medium font-sans">Type</span>
                      <span className="text-slate-800 dark:text-slate-200 text-right truncate max-w-[12rem]" title={detailsItem.mimeType || "Folder"}>
                        {detailsItem.type === "folder" ? "Folder" : (detailsItem.mimeType || "Unknown file")}
                      </span>
                    </div>
                    {detailsItem.type === "file" && detailsItem.sizeBytes && (
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                        <span className="text-slate-500 font-medium font-sans">Size</span>
                        <span className="text-slate-800 dark:text-slate-200 font-semibold">{formatSize(detailsItem.sizeBytes)}</span>
                      </div>
                    )}
                    {detailsItem.type === "file" && detailsItem.provider && (
                      <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                        <span className="text-slate-500 font-medium font-sans">Provider</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {detailsItem.provider}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 font-medium font-sans">Starred</span>
                      <span>
                        {detailsItem.isStarred ? (
                          <span className="flex items-center gap-1 text-amber-500 font-semibold">
                            <i className="fa-solid fa-star"></i> Yes
                          </span>
                        ) : "No"}
                      </span>
                    </div>
                    {detailsItem.createdAt && (
                      <div className="flex flex-col gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                        <span className="text-slate-500 font-medium font-sans">Created At</span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono text-[10px]">
                          {new Date(detailsItem.createdAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {detailsItem.updatedAt && (
                      <div className="flex flex-col gap-0.5 py-1.5">
                        <span className="text-slate-500 font-medium font-sans">Last Modified</span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono text-[10px]">
                          {new Date(detailsItem.updatedAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions Section */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Actions</span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                      <button
                        onClick={() => handleToggleStar(detailsItem as any)}
                        className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className={`${detailsItem.isStarred ? "fa-solid fa-star text-amber-500 animate-pulse" : "fa-regular fa-star text-slate-400"}`}></i>
                        {detailsItem.isStarred ? "Unstar" : "Star"}
                      </button>

                      <button
                        onClick={() => {
                          setRenamingItem({ id: detailsItem.id, name: detailsItem.name, type: detailsItem.type });
                          setRenameName(detailsItem.name);
                          setShowRenameModal(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-pen text-blue-500"></i>
                        Rename
                      </button>

                      <button
                        onClick={() => {
                          setMovingItem({ id: detailsItem.id, name: detailsItem.name, type: detailsItem.type });
                          setDestinationFolderId(detailsItem.type === "folder" ? (detailsItem as any).parentId || "root" : (detailsItem as any).folderId || "root");
                          loadAllFolders();
                          setShowMoveModal(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-folder-open text-orange-500"></i>
                        Move
                      </button>

                      {detailsItem.type === "file" && (
                        <button
                          onClick={() => handleCopyFile({ id: detailsItem.id, name: detailsItem.name })}
                          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <i className="fa-solid fa-copy text-emerald-500"></i>
                          Copy
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setActiveItem(detailsItem as any);
                          setGeneratedShareUrl("");
                          setSharePassword("");
                          setShareExpiresAt("");
                          setShareMaxDownloads("");
                          setShowShareModal(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-share-nodes text-indigo-500"></i>
                        Share Link
                      </button>

                      <button
                        onClick={() => {
                          if (detailsItem.type === "folder") {
                            handleBatchDownload(detailsItem.id);
                          } else {
                            const a = document.createElement("a");
                            a.href = `/api/files/${detailsItem.id}/download`;
                            a.download = detailsItem.name;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-download text-emerald-500"></i>
                        Download
                      </button>

                      {detailsItem.type === "file" && (
                        <button
                          onClick={() => {
                            setActiveItem(detailsItem as any);
                            loadConnectedAccounts();
                            setShowRelocateModal(true);
                          }}
                          className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <i className="fa-solid fa-compass text-amber-500"></i>
                          Relocate
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleSoftDelete(detailsItem as any)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 mt-2 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 transition cursor-pointer font-bold"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                      Move to Trash
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400 dark:text-slate-500">
                  <i className="fa-solid fa-circle-info text-3xl mb-3"></i>
                  <p className="text-xs font-semibold">Select a file or folder to view its detailed parameters</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom-Right Activity Widgets Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-4 items-end pointer-events-none">
        
        {/* Google Drive-Style Upload Widget */}
        {uploading && uploadQueue.length > 0 && (() => {
          const totalItems = uploadQueue.length;
          const completedItems = uploadQueue.filter(item => item.status === "completed").length;
          const failedItems = uploadQueue.filter(item => item.status === "failed").length;
          const isAllDone = completedItems + failedItems === totalItems;
          const overallPercent = totalItems > 0 
            ? Math.round(((completedItems + uploadQueue.reduce((acc, curr) => acc + (curr.status === "uploading" ? curr.progress / 100 : 0), 0)) / totalItems) * 100) 
            : 0;

          return (
            <div className="pointer-events-auto w-[calc(100vw-2rem)] sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-sans text-xs flex flex-col transition-all duration-300">
              {/* Widget Header */}
              <div className="bg-slate-900 dark:bg-slate-950 text-white px-4 py-3 flex items-center justify-between shadow-sm">
                <span className="font-extrabold flex items-center gap-2">
                  {!isAllDone && (
                    <i className="fa-solid fa-circle-notch animate-spin text-blue-400"></i>
                  )}
                  {isAllDone 
                    ? `${completedItems} upload${completedItems !== 1 ? 's' : ''} complete` 
                    : `Uploading ${totalItems - completedItems - failedItems} item${(totalItems - completedItems - failedItems) !== 1 ? 's' : ''}`
                  }
                  {failedItems > 0 && ` (${failedItems} failed)`}
                </span>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsWidgetExpanded(!isWidgetExpanded)} 
                    className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white cursor-pointer"
                    title={isWidgetExpanded ? "Collapse panel" : "Expand panel"}
                  >
                    <i className={`fa-solid ${isWidgetExpanded ? 'fa-chevron-down' : 'fa-chevron-up'} text-xs`}></i>
                  </button>
                  <button 
                    onClick={() => {
                      setUploading(false);
                      setUploadQueue([]);
                    }} 
                    className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white cursor-pointer"
                    title="Close panel"
                  >
                    <i className="fa-solid fa-xmark text-sm"></i>
                  </button>
                </div>
              </div>

              {/* Widget Content */}
              {isWidgetExpanded && (
                <div className="flex flex-col bg-white dark:bg-slate-900">
                  {/* Mini Overall Progress Bar */}
                  {!isAllDone && (
                    <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${overallPercent}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Queue Files List */}
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850 no-scrollbar">
                    {uploadQueue.map((item) => (
                      <div key={item.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* File icon */}
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 flex items-center justify-center">
                            <i className={getFileIconClass(item.name)}></i>
                          </div>
                          
                          {/* File details */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-800 dark:text-slate-200" title={item.relativePath}>
                              {item.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 font-semibold">
                              <span>{formatSize(item.size.toString())}</span>
                              <span>•</span>
                              {item.status === "uploading" && (
                                <span className="text-blue-500 font-bold">Uploading ({item.progress}%)</span>
                              )}
                              {item.status === "completed" && (
                                <span className="text-emerald-500 font-bold">Uploaded</span>
                              )}
                              {item.status === "failed" && (
                                <span className="text-rose-500 font-bold">Failed</span>
                              )}
                              {item.status === "queued" && (
                                <span>Queued</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Status indicator icon */}
                        <div className="flex-shrink-0">
                          {item.status === "completed" && (
                            <i className="fa-solid fa-circle-check text-emerald-500 text-sm"></i>
                          )}
                          {item.status === "failed" && (
                            <i className="fa-solid fa-circle-exclamation text-rose-500 text-sm"></i>
                          )}
                          {item.status === "uploading" && (
                            <i className="fa-solid fa-circle-notch animate-spin text-blue-500 text-sm"></i>
                          )}
                          {item.status === "queued" && (
                            <i className="fa-regular fa-clock text-slate-400 text-sm"></i>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Download Progress Widget */}
        {downloadStatus !== "idle" && (
          <div className="pointer-events-auto w-[calc(100vw-2rem)] sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden font-sans text-xs flex flex-col transition-all duration-300 animate-in slide-in-from-bottom-5">
            {/* Header */}
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-4 py-3 flex items-center justify-between shadow-sm">
              <span className="font-extrabold flex items-center gap-2">
                {downloadStatus === "preparing" && (
                  <i className="fa-solid fa-circle-notch animate-spin text-blue-400"></i>
                )}
                {downloadStatus === "ready" && (
                  <i className="fa-solid fa-circle-check text-emerald-400"></i>
                )}
                {downloadStatus === "failed" && (
                  <i className="fa-solid fa-circle-exclamation text-rose-400"></i>
                )}
                {downloadStatus === "preparing" && "Preparing download..."}
                {downloadStatus === "ready" && "Download started!"}
                {downloadStatus === "failed" && "Download failed"}
              </span>
              <button 
                onClick={() => setDownloadStatus("idle")} 
                className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 flex items-center gap-3 bg-white dark:bg-slate-900">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-file-zipper text-lg"></i>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  {downloadProgressText}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  {downloadStatus === "preparing" && "Compressing files into a ZIP archive..."}
                  {downloadStatus === "ready" && "Check your browser downloads folder."}
                  {downloadStatus === "failed" && "An error occurred while zipping files."}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Drag & Drop Full-screen Overlay */}
      {isDragging && (
        <div 
          className="fixed inset-0 bg-blue-600/10 dark:bg-blue-600/5 backdrop-blur-xs border-4 border-dashed border-blue-500/70 z-50 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center animate-bounce shadow-inner">
              <i className="fa-solid fa-cloud-arrow-up text-3xl"></i>
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Drop files or folders here</h3>
              <p className="text-xs text-slate-500">Files and folder structures will upload automatically to the current directory.</p>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 overflow-y-auto bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center items-start sm:items-center p-4">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-auto">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Create Virtual Folder</h3>
              <p className="text-xs text-slate-500">Folders are virtual and can hold references to multiple cloud accounts.</p>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4 text-xs">
              <input 
                type="text" 
                placeholder="Folder Name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-4.5 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                autoFocus
              />

              <div className="flex items-center gap-3 justify-end pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setNewFolderName("");
                    setShowCreateFolderModal(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white transition cursor-pointer"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RELOCATE STORAGE MODAL */}
      {showRelocateModal && activeItem && (
        <div className="fixed inset-0 overflow-y-auto bg-slate-950/80 backdrop-blur-sm z-45 flex justify-center items-start sm:items-center p-4">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Relocate file storage</h3>
              <button onClick={() => setShowRelocateModal(false)} className="text-slate-500 hover:text-slate-300 cursor-pointer">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleRelocateFile} className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-500 dark:text-slate-400 font-sans">Destination Storage Node</label>
                <select
                  required
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Choose Target Account --</option>
                  {connectedAccounts.filter(a => a.id !== activeItem.connectedAccountId).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayName} ({acc.provider})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">This streams the file server-to-server directly without writing temporary files to disk.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRelocateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition cursor-pointer"
                >
                  {actionLoading && <i className="fa-solid fa-arrows-rotate animate-spin"></i>}
                  Migrate File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERATE PUBLIC SHARE LINK MODAL */}
      {showShareModal && activeItem && (
        <div className="fixed inset-0 overflow-y-auto bg-slate-950/80 backdrop-blur-sm z-45 flex justify-center items-start sm:items-center p-4">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Public Share Settings</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-500 hover:text-slate-300 cursor-pointer">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleCreatePublicShare} className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-500 dark:text-slate-400">Password Guard (Optional)</label>
                <input
                  type="password"
                  placeholder="Set password gate"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-slate-500 dark:text-slate-400">Expiration Date (Optional)</label>
                  <input
                    type="date"
                    value={shareExpiresAt}
                    onChange={(e) => setShareExpiresAt(e.target.value)}
                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-slate-500 dark:text-slate-400">Max Downloads (Optional)</label>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={shareMaxDownloads}
                    onChange={(e) => setShareMaxDownloads(e.target.value)}
                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {generatedShareUrl && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
                  <div className="overflow-hidden font-mono text-[10px] text-blue-600 dark:text-indigo-300 select-all truncate">
                    {generatedShareUrl}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedShareUrl);
                      window.alert("Share URL copied to clipboard!");
                    }}
                    className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    <i className="fa-solid fa-copy"></i>
                  </button>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition cursor-pointer"
                >
                  {actionLoading && <i className="fa-solid fa-arrows-rotate animate-spin"></i>}
                  {generatedShareUrl ? "Re-generate Share Link" : "Generate Share Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW LIGHTBOX OVERLAY */}
      {previewItem && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col justify-between p-4 animate-in fade-in duration-200 text-white animate-in">
          {/* Top Navbar */}
          <div className="flex items-center justify-between py-3 px-4 border-b border-slate-800/80 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                {previewItem.mimeType.startsWith("image/") ? (
                  <i className="fa-solid fa-image text-blue-400"></i>
                ) : previewItem.mimeType.startsWith("video/") ? (
                  <i className="fa-solid fa-video text-purple-400"></i>
                ) : previewItem.mimeType.startsWith("audio/") ? (
                  <i className="fa-solid fa-music text-emerald-400"></i>
                ) : previewItem.mimeType.includes("pdf") ? (
                  <i className="fa-solid fa-file-pdf text-rose-400"></i>
                ) : (
                  <i className="fa-solid fa-file-code text-indigo-400"></i>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-slate-100 truncate" title={previewItem.name}>
                  {previewItem.name}
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold">{formatSize(previewItem.sizeBytes)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={`/api/files/${previewItem.id}/download`}
                download={previewItem.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-bold transition text-slate-200"
              >
                <i className="fa-solid fa-download"></i>
                Download
              </a>
              <button
                onClick={() => {
                  setPreviewItem(null);
                  setPreviewText(null);
                }}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Close (Esc)"
              >
                <i className="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
          </div>

          {/* Centered Media Player Container */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative max-h-[calc(100vh-8rem)]">
            {previewItem.mimeType.startsWith("image/") ? (
              <img
                src={`/api/files/${previewItem.id}/download?inline=true`}
                alt={previewItem.name}
                className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800/40"
              />
            ) : previewItem.mimeType.startsWith("video/") ? (
              <video
                src={`/api/files/${previewItem.id}/download?inline=true`}
                controls
                className="max-h-full max-w-full rounded-2xl shadow-2xl border border-slate-800/40 bg-black"
                autoPlay
              />
            ) : previewItem.mimeType.startsWith("audio/") ? (
              <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md shadow-2xl flex flex-col items-center gap-5 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shadow-inner">
                  <i className="fa-solid fa-music text-4xl animate-pulse"></i>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-100 truncate w-64 mx-auto">{previewItem.name}</h4>
                  <p className="text-[10px] text-slate-400 font-semibold">{formatSize(previewItem.sizeBytes)}</p>
                </div>
                <audio
                  src={`/api/files/${previewItem.id}/download?inline=true`}
                  controls
                  className="w-full mt-2"
                  autoPlay
                />
              </div>
            ) : previewItem.mimeType.includes("pdf") ? (
              <iframe
                src={`/api/files/${previewItem.id}/download?inline=true`}
                className="w-full h-full max-w-5xl rounded-2xl shadow-2xl border border-slate-800 bg-white"
              />
            ) : (previewItem.mimeType.startsWith("text/") || previewItem.mimeType.includes("json") || previewItem.mimeType.includes("javascript")) ? (
              <div className="w-full h-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
                {loadingPreviewText ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3">
                    <i className="fa-solid fa-arrows-rotate animate-spin text-2xl text-blue-500"></i>
                    <span className="text-xs text-slate-400 font-bold">Loading file contents...</span>
                  </div>
                ) : (
                  <pre className="flex-1 p-5 overflow-auto text-left font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap select-text">
                    {previewText}
                  </pre>
                )}
              </div>
            ) : (
              <div className="w-full max-w-sm p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center gap-5 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-705 flex items-center justify-center text-slate-400">
                  <i className="fa-solid fa-file text-3xl"></i>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-100 truncate w-64 mx-auto">{previewItem.name}</h4>
                  <span className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {previewItem.mimeType || "Unknown Type"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-semibold px-4">Direct preview is not supported for this file format.</p>
                <a
                  href={`/api/files/${previewItem.id}/download`}
                  download={previewItem.name}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/10 transition cursor-pointer"
                >
                  <i className="fa-solid fa-download"></i>
                  Download File
                </a>
              </div>
            )}
          </div>

          {/* Bottom Bar Info */}
          <div className="py-2.5 px-4 text-center text-[10px] text-slate-500 font-semibold w-full">
            Press <span className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-300">Esc</span> key to close preview
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {showRenameModal && renamingItem && (
        <div className="fixed inset-0 overflow-y-auto bg-slate-950/80 backdrop-blur-sm z-45 flex justify-center items-start sm:items-center p-4">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Rename {renamingItem.type === "file" ? "File" : "Folder"}</h3>
              <button onClick={() => { setShowRenameModal(false); setRenamingItem(null); }} className="text-slate-500 hover:text-slate-300 cursor-pointer">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-500 dark:text-slate-400 font-sans">New Name</label>
                <input
                  type="text"
                  required
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowRenameModal(false); setRenamingItem(null); }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition cursor-pointer"
                >
                  {actionLoading && <i className="fa-solid fa-arrows-rotate animate-spin"></i>}
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MOVE MODAL */}
      {showMoveModal && movingItem && (
        <div className="fixed inset-0 overflow-y-auto bg-slate-950/80 backdrop-blur-sm z-45 flex justify-center items-start sm:items-center p-4">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100 my-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Move {movingItem.type === "file" ? "File" : "Folder"}</h3>
              <button onClick={() => { setShowMoveModal(false); setMovingItem(null); }} className="text-slate-500 hover:text-slate-300 cursor-pointer">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleMoveSubmit} className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-semibold text-slate-500 dark:text-slate-400 font-sans">Destination Folder</label>
                <select
                  value={destinationFolderId}
                  onChange={(e) => setDestinationFolderId(e.target.value)}
                  className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="root">All Files (Root)</option>
                  {allFolders
                    .filter(f => f.id !== movingItem.id) // Cannot move into itself
                    .map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowMoveModal(false); setMovingItem(null); }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition cursor-pointer"
                >
                  {actionLoading && <i className="fa-solid fa-arrows-rotate animate-spin"></i>}
                  Move
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}

