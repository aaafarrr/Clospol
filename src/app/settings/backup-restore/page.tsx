"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

export default function BackupRestoreHubPage() {
  const [activeTab, setActiveTab] = useState<"cloud" | "platform">("cloud");
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // ==========================================
  // 1. CLOUD REGISTRY SYNC STATE
  // ==========================================
  const [syncing, setSyncing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [drives, setDrives] = useState<any[]>([]);
  const [storageAccountId, setStorageAccountId] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  
  const [syncPassphrase, setSyncPassphrase] = useState("");
  const [showSyncPass, setShowSyncPass] = useState(false);

  const [recoveryMethod, setRecoveryMethod] = useState<"drive" | "direct">("drive");
  const [recoveryStorageAccountId, setRecoveryStorageAccountId] = useState("");
  const [recoveryPassphrase, setRecoveryPassphrase] = useState("");
  const [showRecoveryPass, setShowRecoveryPass] = useState(false);

  // Direct S3 configuration
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false);
  const [s3Prefix, setS3Prefix] = useState("clospol");

  // ==========================================
  // 2. PLATFORM ZIP ARCHIVE STATE
  // ==========================================
  const [backupIncludeEnv, setBackupIncludeEnv] = useState(true);
  const [backupIncludeDb, setBackupIncludeDb] = useState(true);
  const [backupIncludeFiles, setBackupIncludeFiles] = useState(true);

  const [restoreIncludeEnv, setRestoreIncludeEnv] = useState(true);
  const [restoreIncludeDb, setRestoreIncludeDb] = useState(true);
  const [restoreIncludeFiles, setRestoreIncludeFiles] = useState(true);

  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [restoringZip, setRestoringZip] = useState(false);
  const [restoreStep, setRestoreStep] = useState("");
  const [restoreError, setRestoreError] = useState("");

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/settings/registry/status");
      if (res.ok) {
        const data = await res.json();
        setDrives(data.drives || []);
        setAutoSync(data.autoSync || false);
        setLastSyncedAt(data.lastSyncedAt || null);

        // Pre-select drive
        if (data.storageAccountId) {
          setStorageAccountId(data.storageAccountId);
          setRecoveryStorageAccountId(data.storageAccountId);
        } else if (data.drives && data.drives.length > 0) {
          setStorageAccountId(data.drives[0].id);
          setRecoveryStorageAccountId(data.drives[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load registry status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const triggerAlert = (msg: string, type: "success" | "error" | "info") => {
    if (type === "success") {
      toast.success(msg);
    } else if (type === "error") {
      toast.error(msg);
    } else {
      toast.info(msg);
    }
  };

  const formatDateTime = (isoStr: string | null) => {
    if (!isoStr) return "Never";
    try {
      const date = new Date(isoStr);
      return date.toLocaleString();
    } catch (_) {
      return isoStr;
    }
  };

  // ==========================================
  // CLOUD REGISTRY ACTIONS
  // ==========================================
  const handleCloudBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storageAccountId) {
      triggerAlert("Please select a target cloud storage drive first.", "error");
      return;
    }
    if (!syncPassphrase || syncPassphrase.length < 6) {
      triggerAlert("Sync Passphrase must be at least 6 characters long.", "error");
      return;
    }

    setSyncing(true);
    triggerAlert("Exporting database configurations and syncing to cloud registry...", "info");

    try {
      const res = await fetch("/api/settings/registry/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageAccountId,
          passphrase: syncPassphrase,
          autoSync,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        triggerAlert(data.message || "Configurations successfully synced to cloud registry!", "success");
        setLastSyncedAt(data.lastSyncedAt);
      } else {
        triggerAlert(data.error || "Failed to sync configurations to cloud.", "error");
      }
    } catch (err: any) {
      triggerAlert(err.message || "An unexpected error occurred during sync.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleCloudRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoveryMethod === "drive" && !recoveryStorageAccountId) {
      triggerAlert("Please select a storage drive to recover from.", "error");
      return;
    }
    if (recoveryMethod === "direct" && (!s3Bucket || !s3Region || !s3AccessKey || !s3SecretKey)) {
      triggerAlert("Please fill in all S3 credentials for direct recovery.", "error");
      return;
    }
    if (!recoveryPassphrase) {
      triggerAlert("Sync Passphrase is required to decrypt registry snapshot.", "error");
      return;
    }

    if (
      !confirm(
        "WARNING: Restoring will overwrite all current database settings, CCTV cameras, connected drives, custom routing rules, backup schedules, files and folders with the cloud configuration. This action cannot be undone. Do you wish to proceed?"
      )
    ) {
      return;
    }

    setRecovering(true);
    triggerAlert("Downloading registry from cloud and importing configurations...", "info");

    try {
      const payload: any = {
        passphrase: recoveryPassphrase,
      };

      if (recoveryMethod === "drive") {
        payload.storageAccountId = recoveryStorageAccountId;
      } else {
        payload.bucket = s3Bucket;
        payload.region = s3Region;
        payload.accessKeyId = s3AccessKey;
        payload.secretAccessKey = s3SecretKey;
        payload.endpoint = s3Endpoint || undefined;
        payload.forcePathStyle = s3ForcePathStyle;
        payload.prefix = s3Prefix;
      }

      const res = await fetch("/api/settings/registry/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        triggerAlert("Configuration registry successfully restored! Reloading system...", "success");
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        triggerAlert(data.error || "Failed to recover configuration registry.", "error");
      }
    } catch (err: any) {
      triggerAlert(err.message || "An unexpected error occurred during recovery.", "error");
    } finally {
      setRecovering(false);
    }
  };

  // ==========================================
  // PLATFORM ZIP ACTIONS
  // ==========================================
  const handleExportZip = () => {
    if (!backupIncludeEnv && !backupIncludeDb && !backupIncludeFiles) {
      toast.warn("Please select at least one component to backup.");
      return;
    }
    const params = new URLSearchParams();
    if (backupIncludeEnv) params.append("env", "true");
    if (backupIncludeDb) params.append("db", "true");
    if (backupIncludeFiles) params.append("files", "true");

    window.open(`/api/settings/backup?${params.toString()}`, "_blank");
  };

  const handleRestoreZip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZipFile) {
      toast.warn("Please select a backup ZIP archive first.");
      return;
    }
    if (!restoreIncludeEnv && !restoreIncludeDb && !restoreIncludeFiles) {
      toast.warn("Please select at least one component to restore.");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to restore? This will overwrite existing configs, files, or database contents based on your selection. Overwriting database will reboot the platform."
      )
    ) {
      return;
    }

    setRestoringZip(true);
    setRestoreError("");
    setRestoreStep("Uploading backup ZIP archive...");

    const formData = new FormData();
    formData.append("file", selectedZipFile);
    formData.append("restoreEnv", restoreIncludeEnv ? "true" : "false");
    formData.append("restoreDb", restoreIncludeDb ? "true" : "false");
    formData.append("restoreFiles", restoreIncludeFiles ? "true" : "false");

    try {
      setRestoreStep("Extracting and restoring selected components...");
      const res = await fetch("/api/settings/restore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        if (data.restartRequired) {
          setRestoreStep("Restore complete. Re-initiating SQLite connection & rebooting system...");
          setTimeout(() => {
            window.location.reload();
          }, 2500);
        } else {
          triggerAlert(data.message || "Backup successfully restored.", "success");
          setRestoringZip(false);
          setSelectedZipFile(null);
        }
      } else {
        setRestoreError(data.error || "Failed to restore backup.");
        setRestoringZip(false);
      }
    } catch (err: any) {
      setRestoreError(err.message || "Failed to contact restore endpoint.");
      setRestoringZip(false);
    }
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <i className="fa-solid fa-vault text-blue-500"></i> Backup & Restore Hub
          </h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Maintain full control over your Clospol server state. Synchronize configuration registries to the cloud or export entire platform ZIP archives.
          </p>
        </div>



        {/* Tab Selection */}
        <div className="flex space-x-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-2xl max-w-md border border-slate-200/40 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab("cloud")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "cloud"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-450 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <i className="fa-solid fa-cloud"></i>
            <span>Cloud Registry Sync</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("platform")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "platform"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-450 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <i className="fa-solid fa-file-zipper"></i>
            <span>Platform ZIP Archive</span>
          </button>
        </div>

        {/* Content Loading Skeleton */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 w-full animate-pulse">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 space-y-4"
              >
                <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-4 w-60 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {/* ============================================================== */}
            {/* TAB 1: CLOUD REGISTRY SYNC */}
            {/* ============================================================== */}
            {activeTab === "cloud" && (
              <div className="grid gap-6 md:grid-cols-2 w-full items-start animate-in fade-in duration-200">
                {/* Backup column */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <i className="fa-solid fa-cloud-arrow-up text-blue-500"></i> Cloud Registry Backup
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                      Export and upload your local Clospol configurations to your connected cloud storage.
                    </p>
                  </div>

                  {/* Status Card */}
                  <div className="border border-slate-200/60 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/40 dark:bg-slate-950/20 space-y-2.5 text-xs font-semibold">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Last Synchronized:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-bold">
                        {formatDateTime(lastSyncedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Connected Drives Available:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{drives.length} active</span>
                    </div>
                  </div>

                  {drives.length === 0 ? (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-2xl text-xs space-y-2 font-bold leading-normal">
                      <p>No active Google Drive, OneDrive, Dropbox, or AWS S3 storage connections found.</p>
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-normal">
                        Go to <a href="/settings/drives" className="text-blue-500 underline">Connected Drives</a> to add a cloud storage account before syncing.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleCloudBackup} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Registry Cloud Drive</label>
                        <select
                          value={storageAccountId}
                          onChange={(e) => setStorageAccountId(e.target.value)}
                          className="w-full h-11 border border-slate-250 dark:border-slate-800 rounded-xl px-4 text-xs font-bold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                        >
                          {drives.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.displayName} ({d.email || d.provider})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Sync Security Passphrase</label>
                        <div className="relative">
                          <input
                            type={showSyncPass ? "text" : "password"}
                            required
                            value={syncPassphrase}
                            onChange={(e) => setSyncPassphrase(e.target.value)}
                            placeholder="Min. 6 characters password"
                            className="w-full h-11 border border-slate-250 dark:border-slate-800 rounded-xl px-4 pr-10 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSyncPass(!showSyncPass)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer"
                          >
                            <i className={`fa-solid ${showSyncPass ? "fa-eye-slash" : "fa-eye"} text-xs`}></i>
                          </button>
                        </div>
                      </div>

                      <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={autoSync}
                          onChange={(e) => setAutoSync(e.target.checked)}
                          className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                        />
                        <span>Automatically sync settings updates to registry</span>
                      </label>

                      <button
                        type="submit"
                        disabled={syncing}
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {syncing ? (
                          <>
                            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                            Syncing Configurations...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-cloud-arrow-up"></i>
                            Backup to Cloud Registry
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>

                {/* Recovery column */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <i className="fa-solid fa-cloud-arrow-down text-blue-500"></i> Cloud Registry Recovery
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                      Decrypt and restore your full configurations from the cloud registry snapshot.
                    </p>
                  </div>

                  <div className="flex border-b border-slate-250 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setRecoveryMethod("drive")}
                      className={`flex-1 pb-2.5 text-xs font-bold transition border-b-2 text-center cursor-pointer ${
                        recoveryMethod === "drive"
                          ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                          : "border-transparent text-slate-450 hover:text-slate-600 dark:hover:text-slate-350"
                      }`}
                    >
                      <i className="fa-solid fa-link mr-1"></i> Connected Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecoveryMethod("direct")}
                      className={`flex-1 pb-2.5 text-xs font-bold transition border-b-2 text-center cursor-pointer ${
                        recoveryMethod === "direct"
                          ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                          : "border-transparent text-slate-450 hover:text-slate-600 dark:hover:text-slate-350"
                      }`}
                    >
                      <i className="fa-solid fa-database mr-1"></i> Direct S3 Credentials
                    </button>
                  </div>

                  <form onSubmit={handleCloudRecover} className="space-y-4">
                    {recoveryMethod === "drive" ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Select Source Drive</label>
                        {drives.length === 0 ? (
                          <p className="text-xs text-slate-450 italic font-semibold">No connected drives. Use S3 credentials instead.</p>
                        ) : (
                          <select
                            value={recoveryStorageAccountId}
                            onChange={(e) => setRecoveryStorageAccountId(e.target.value)}
                            className="w-full h-11 border border-slate-250 dark:border-slate-800 rounded-xl px-4 text-xs font-bold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                          >
                            {drives.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.displayName} ({d.email || d.provider})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3.5 border border-slate-200/60 dark:border-slate-850 p-4 rounded-2xl bg-slate-50/20 dark:bg-slate-950/20">
                        <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                          Temporary AWS S3 Connection Setup
                        </span>
                        <div className="grid gap-3 grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">AWS S3 Bucket</label>
                            <input
                              type="text"
                              required={recoveryMethod === "direct"}
                              value={s3Bucket}
                              onChange={(e) => setS3Bucket(e.target.value)}
                              placeholder="e.g. clospol-registry"
                              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-850 text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Region</label>
                            <input
                              type="text"
                              required={recoveryMethod === "direct"}
                              value={s3Region}
                              onChange={(e) => setS3Region(e.target.value)}
                              placeholder="us-east-1"
                              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-850 text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Access Key ID</label>
                          <input
                            type="text"
                            required={recoveryMethod === "direct"}
                            value={s3AccessKey}
                            onChange={(e) => setS3AccessKey(e.target.value)}
                            placeholder="Access key string"
                            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-850 text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Secret Access Key</label>
                          <input
                            type="password"
                            required={recoveryMethod === "direct"}
                            value={s3SecretKey}
                            onChange={(e) => setS3SecretKey(e.target.value)}
                            placeholder="Secret key string"
                            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-850 text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Endpoint URL (Optional)</label>
                          <input
                            type="text"
                            value={s3Endpoint}
                            onChange={(e) => setS3Endpoint(e.target.value)}
                            placeholder="e.g. http://minio.local:9000"
                            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-850 text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                          />
                        </div>

                        <div className="grid gap-3 grid-cols-2 items-center">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400">Registry Path Prefix</label>
                            <input
                              type="text"
                              value={s3Prefix}
                              onChange={(e) => setS3Prefix(e.target.value)}
                              placeholder="clospol"
                              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-850 text-xs bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 mt-4.5 cursor-pointer text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={s3ForcePathStyle}
                              onChange={(e) => setS3ForcePathStyle(e.target.checked)}
                              className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                            />
                            <span>Force Path Style</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Sync Decryption Passphrase</label>
                      <div className="relative">
                        <input
                          type={showRecoveryPass ? "text" : "password"}
                          required
                          value={recoveryPassphrase}
                          onChange={(e) => setRecoveryPassphrase(e.target.value)}
                          placeholder="Passphrase used for backup"
                          className="w-full h-11 border border-slate-250 dark:border-slate-800 rounded-xl px-4 pr-10 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRecoveryPass(!showRecoveryPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 cursor-pointer"
                        >
                          <i className={`fa-solid ${showRecoveryPass ? "fa-eye-slash" : "fa-eye"} text-xs`}></i>
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold space-y-1 text-[11px] leading-relaxed">
                      <div className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-600 dark:text-amber-300 tracking-wide mb-0.5">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>Database Overwrite Warning</span>
                      </div>
                      <span>
                        Executing a recovery will completely purge your local cameras, storage settings, API tokens, and backup schedules for your user account on this server and replace them with the retrieved registry state.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={recovering}
                      className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-500/10 disabled:opacity-50 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {recovering ? (
                        <>
                          <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                          Recovering System State...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-cloud-arrow-down"></i>
                          Recover from Cloud Registry
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: PLATFORM ZIP ARCHIVE */}
            {/* ============================================================== */}
            {activeTab === "platform" && (
              <div className="grid gap-6 md:grid-cols-2 w-full items-start animate-in fade-in duration-200">
                {/* Local ZIP export */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <i className="fa-solid fa-file-export text-blue-500"></i> Platform Export Archive
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                      Pack your local SQLite files, configs, and media folder into a single ZIP archive.
                    </p>
                  </div>

                  {/* Warning message */}
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold space-y-1.5 text-xs leading-normal">
                    <div className="flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wide text-amber-600 dark:text-amber-300">
                      <i className="fa-solid fa-triangle-exclamation text-sm text-amber-500"></i>
                      <span>ZIP Archive Limits</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1 font-semibold text-[11px]">
                      <li><strong>Local Only:</strong> Files in remote S3 buckets/Google Drive will not be copied inside the ZIP file.</li>
                      <li><strong>Sessions Excluded:</strong> Integrations (WhatsApp session tokens, OAuth cookies) must be reconnected manually post-restore.</li>
                    </ul>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Modules to Backup</label>
                      <div className="space-y-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={backupIncludeEnv}
                            onChange={(e) => setBackupIncludeEnv(e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                          />
                          <span>Environment Config (<code>.env</code> file settings)</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={backupIncludeDb}
                            onChange={(e) => setBackupIncludeDb(e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                          />
                          <span>Database Metadata (SQLite <code>dev.db</code> schemas)</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={backupIncludeFiles}
                            onChange={(e) => setBackupIncludeFiles(e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                          />
                          <span>Local Physical Storage Files (<code>storage/local</code> files)</span>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={handleExportZip}
                      className="w-full h-11 mt-1 bg-slate-800 hover:bg-slate-900 dark:bg-slate-750 dark:hover:bg-slate-800 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className="fa-solid fa-file-export"></i>
                      <span>Export ZIP Backup</span>
                    </button>
                  </div>
                </div>

                {/* Local ZIP restore */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <i className="fa-solid fa-file-import text-blue-500"></i> Platform Restore Archive
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                      Upload and extract components from a previously exported ZIP platform archive.
                    </p>
                  </div>

                  {restoreError && (
                    <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-between gap-2.5 text-xs text-red-700 dark:text-red-400 font-bold animate-in slide-in-from-top-1">
                      <span className="truncate">{restoreError}</span>
                      <button onClick={() => setRestoreError("")} className="text-red-450 hover:text-red-650 transition shrink-0 cursor-pointer">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  )}

                  {restoringZip ? (
                    <div className="py-6 text-center space-y-3.5">
                      <span className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mx-auto block"></span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{restoreStep}</p>
                    </div>
                  ) : (
                    <form onSubmit={handleRestoreZip} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Restore Modules</label>
                        <div className="space-y-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={restoreIncludeEnv}
                              onChange={(e) => setRestoreIncludeEnv(e.target.checked)}
                              className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                            />
                            <span>Restore Environment (Overwrites <code>.env</code> file)</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={restoreIncludeDb}
                              onChange={(e) => setRestoreIncludeDb(e.target.checked)}
                              className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                            />
                            <span>Restore Database (SQLite overwrite + system reboot)</span>
                          </label>
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={restoreIncludeFiles}
                              onChange={(e) => setRestoreIncludeFiles(e.target.checked)}
                              className="h-4 w-4 text-blue-600 border-slate-350 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                            />
                            <span>Restore Local Files (Extracts to <code>storage/local</code>)</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Select Backup ZIP Archive</label>
                        <input
                          type="file"
                          accept=".zip"
                          onChange={(e) => setSelectedZipFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-slate-500 dark:text-slate-450 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950/40 dark:file:text-blue-400 cursor-pointer"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={!selectedZipFile}
                        className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-500/10 disabled:opacity-50 transition flex items-center justify-center gap-2 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <i className="fa-solid fa-file-import"></i>
                        <span>Upload & Restore Platform</span>
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
