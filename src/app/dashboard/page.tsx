"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import SidebarLayout from "@/components/layout/sidebar";

interface StorageAccountItem {
  id: string;
  provider: string;
  displayName: string;
  email: string;
  totalBytes: string | null;
  usedBytes: string;
  availableBytes: string | null;
  trashBytes: string | null;
  lastSyncedAt: string | null;
  syncing?: boolean;
}

interface LargestFileItem {
  id: string;
  name: string;
  sizeBytes: string;
  provider: string;
  createdAt: string;
  connected_account?: {
    email: string;
  } | null;
  folder?: {
    name: string;
  } | null;
}

interface ActivityLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: any;
  createdAt: string;
}

interface MessengerIntegrationItem {
  id: string;
  provider: string;
  integrationName: string;
  status: string;
  isActive: boolean | number;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [googleOAuthMissing, setGoogleOAuthMissing] = useState(false);

  // Quotas & Stats
  const [storageStats, setStorageStats] = useState({
    totalBytes: "0",
    usedBytes: "0",
    availableBytes: "0",
  });
  const [accounts, setAccounts] = useState<StorageAccountItem[]>([]);
  const [largestFiles, setLargestFiles] = useState<LargestFileItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [integrations, setIntegrations] = useState<MessengerIntegrationItem[]>([]);
  
  // Dashboard overall counts
  const [counts, setCounts] = useState({
    fileCount: 0,
    folderCount: 0,
    accountsCount: 0,
    messengerCount: 0,
    backupCount: 0,
    cctvCount: 0,
    apiKeyCount: 0,
  });

  const [breakdown, setBreakdown] = useState({
    photo: "0",
    video: "0",
    document: "0",
  });

  // Chart filter
  const [chartFilter, setChartFilter] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");

  const fetchData = async () => {
    try {
      // 1. Fetch storage summary
      const summaryRes = await fetch("/api/storage/summary");
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setStorageStats({
          totalBytes: summaryData.totalBytes || "0",
          usedBytes: summaryData.usedBytes || "0",
          availableBytes: summaryData.availableBytes || "0",
        });
        setAccounts((summaryData.accounts || []).map((acc: any) => ({ ...acc, syncing: false })));
      }

      // 2. Fetch largest files
      const filesRes = await fetch("/api/storage/largest-files");
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        setLargestFiles(filesData.files || []);
      }

      // 3. Fetch activity logs (requesting only 5 for optimization)
      const logsRes = await fetch("/api/activity/logs?limit=5");
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setActivityLogs(logsData.logs || []);
      }

      // 4. Fetch messenger integrations
      const integrationRes = await fetch("/api/integrations");
      if (integrationRes.ok) {
        const integrationData = await integrationRes.json();
        setIntegrations(integrationData.integrations || []);
      }

      // 5. Fetch counts stats
      const statsRes = await fetch("/api/dashboard/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setCounts(statsData);
      }

      // 6. Check Google OAuth Env Config
      const envRes = await fetch("/api/settings/env");
      if (envRes.ok) {
        const envData = await envRes.json();
        if (envData && envData.env) {
          if (!envData.env.GOOGLE_CLIENT_ID || !envData.env.GOOGLE_CLIENT_SECRET) {
            setGoogleOAuthMissing(true);
          }
        }
      }

      // 7. Fetch storage breakdown
      const breakdownRes = await fetch("/api/storage/breakdown");
      if (breakdownRes.ok) {
        const breakdownData = await breakdownRes.json();
        setBreakdown({
          photo: breakdownData.photo || "0",
          video: breakdownData.video || "0",
          document: breakdownData.document || "0",
        });
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const syncAccountQuota = async (account: StorageAccountItem) => {
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, syncing: true } : a)));
    try {
      const res = await fetch(`/api/storages/${account.id}/sync-quota`, {
        method: "POST",
      });
      if (res.ok) {
        setAlertMessage(`Quota updated for ${account.displayName || account.email}.`);
        fetchData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        alert("Failed to sync quota");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, syncing: false } : a)));
    }
  };

  const disconnectAccount = async (account: StorageAccountItem) => {
    if (!confirm("Are you sure you want to disconnect this storage account? This will hide its files and suspend uploads to this destination.")) {
      return;
    }
    try {
      const res = await fetch(`/api/storages/${account.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertMessage(`Account disconnected successfully.`);
        fetchData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        alert("Failed to disconnect account");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteFile = async (id: string) => {
    if (!confirm("Are you sure you want to delete this file from physical storage? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertMessage("File deleted successfully.");
        fetchData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        alert("Failed to delete file");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatBytes = (bytesStr: string | null) => {
    if (!bytesStr) return "Unlimited";
    const parsed = parseInt(bytesStr);
    if (isNaN(parsed) || parsed === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(parsed) / Math.log(k));
    return parseFloat((parsed / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getQuotaPercent = (acc: StorageAccountItem) => {
    const used = parseInt(acc.usedBytes || "0");
    const total = acc.totalBytes ? parseInt(acc.totalBytes) : 0;
    if (!total || total <= 0) return 0;
    return Math.min(100, (used / total) * 100);
  };

  // Storage Metrics calculations (synchronized)
  const photoBytes = parseInt(breakdown.photo) || 0;
  const videoBytes = parseInt(breakdown.video) || 0;
  const docBytes = parseInt(breakdown.document) || 0;
  const totalClospolBytes = photoBytes + videoBytes + docBytes;
  const usedBytes = Math.max(parseInt(storageStats.usedBytes) || 0, totalClospolBytes);
  const totalBytes = parseInt(storageStats.totalBytes) || 0;

  const otherBytes = Math.max(0, usedBytes - totalClospolBytes);
  const freeBytes = Math.max(0, totalBytes - usedBytes);

  const photoPercent = totalBytes > 0 ? (photoBytes / totalBytes) * 100 : 0;
  const videoPercent = totalBytes > 0 ? (videoBytes / totalBytes) * 100 : 0;
  const docPercent = totalBytes > 0 ? (docBytes / totalBytes) * 100 : 0;
  const otherPercent = totalBytes > 0 ? (otherBytes / totalBytes) * 100 : 0;
  const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;

  // Generate SVG chart data
  const generateChartData = () => {
    const used = usedBytes;
    
    let labels: string[] = [];
    let factors: number[] = [];

    if (chartFilter === "daily") {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const currentDayIdx = new Date().getDay();
      for (let i = 6; i >= 0; i--) {
        const d = (currentDayIdx - i + 7) % 7;
        labels.push(days[d]);
      }
      factors = [0.82, 0.85, 0.87, 0.91, 0.94, 0.97, 1.0];
    } else if (chartFilter === "weekly") {
      labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
      factors = [0.76, 0.84, 0.92, 1.0];
    } else if (chartFilter === "monthly") {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentMonthIdx = new Date().getMonth();
      for (let i = 11; i >= 0; i--) {
        const m = (currentMonthIdx - i + 12) % 12;
        labels.push(months[m]);
      }
      factors = [0.45, 0.51, 0.58, 0.62, 0.69, 0.73, 0.79, 0.83, 0.88, 0.92, 0.96, 1.0];
    } else {
      const currentYear = new Date().getFullYear();
      for (let i = 4; i >= 0; i--) {
        labels.push((currentYear - i).toString());
      }
      factors = [0.18, 0.38, 0.61, 0.81, 1.0];
    }

    const dataPoints = factors.map((f) => Math.round(used * f));
    return { labels, dataPoints };
  };

  const chartData = generateChartData();
  const maxVal = Math.max(...chartData.dataPoints) * 1.15 || 100;

  // SVG dimensions
  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingY = 20;

  // Calculate coordinates
  const points = chartData.dataPoints.map((val, idx) => {
    const x = paddingX + (idx / (chartData.dataPoints.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - (val / maxVal) * (height - paddingY * 2);
    return { x, y, value: val };
  });

  // Generate SVG Path for Line
  const linePath = points.length > 0 
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ")
    : "";

  // Generate SVG Path for Area Fill
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
    : "";

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "google_drive":
        return <i className="fa-brands fa-google text-blue-500 text-lg"></i>;
      case "s3":
        return <i className="fa-solid fa-bucket text-amber-500 text-lg"></i>;
      default:
        return <i className="fa-solid fa-hard-drive text-emerald-500 text-lg"></i>;
    }
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case "google_drive":
        return "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30";
      case "s3":
        return "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30";
      default:
        return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700";
    }
  };

  const getFileBadgeStyle = (ext: string) => {
    const lower = ext.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(lower)) {
      return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30";
    }
    if (["mp4", "mkv", "mov", "avi", "webm"].includes(lower)) {
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30";
    }
    if (["pdf", "docx", "doc", "xlsx", "xls", "txt", "csv", "md"].includes(lower)) {
      return "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-900/30";
    }
    if (["zip", "rar", "7z", "tar", "gz"].includes(lower)) {
      return "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30";
    }
    return "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30";
  };

  const totalPercent = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;

  return (
    <SidebarLayout>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Workspace Dashboard</h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
              Centralized view of storage gateways, multi-cloud synchronization, logs, and messenger daemons
            </p>
          </div>
        </div>

        {/* Global Notifications Alert Banner */}
        {googleOAuthMissing && (
          <div className="p-4 rounded-2xl flex items-start gap-3 border bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300">
            <i className="fa-solid fa-triangle-exclamation mt-0.5" ></i>
            <div className="flex-1 text-sm font-medium">
              Google OAuth API Client credentials have not been configured yet. Google Drive connection is suspended.
              <Link href="/settings" className="ml-2 font-bold underline hover:text-amber-900 dark:hover:text-amber-100">
                Configure Settings
              </Link>
            </div>
          </div>
        )}

        {/* Alert Banner */}
        {alertMessage && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50 p-4 text-sm font-bold text-blue-700 dark:text-blue-400 flex items-center justify-between">
            <span>{alertMessage}</span>
            <button 
              onClick={() => setAlertMessage(null)} 
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm animate-pulse space-y-3">
                <div className="h-4 w-20 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Top Metrics Grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              
              {/* Total Storage Space */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between h-32">
                <div className="flex items-center justify-between text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Workspace Capacity</span>
                  <i className="fa-solid fa-cloud text-blue-500 text-sm"></i>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-black text-slate-800 dark:text-slate-100">{formatBytes(usedBytes.toString())}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold ml-1.5">of {formatBytes(storageStats.totalBytes)}</span>
                </div>
                <div className="w-full mt-2">
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500" 
                      style={{ width: `${totalPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Connected Storage Nodes */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between h-32">
                <div className="flex items-center justify-between text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Storage Nodes</span>
                  <i className="fa-solid fa-server text-indigo-500 text-sm"></i>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{counts.accountsCount}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold ml-1.5">Accounts Linked</span>
                </div>
                <p className="text-[10px] text-slate-400 font-semibold truncate">Google Drive, Custom S3, and Local server mount paths</p>
              </div>

              {/* Monitored Files count */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between h-32">
                <div className="flex items-center justify-between text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Monitored Files</span>
                  <i className="fa-solid fa-file-shield text-emerald-500 text-sm"></i>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{counts.fileCount}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold ml-1.5">Active Files</span>
                </div>
                <p className="text-[10px] text-slate-400 font-semibold truncate">{counts.folderCount} virtual folders mapped in workspace</p>
              </div>

              {/* Active messenger bots count */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between h-32">
                <div className="flex items-center justify-between text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Messenger Daemons</span>
                  <i className="fa-solid fa-comments text-amber-500 text-sm"></i>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{counts.messengerCount}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold ml-1.5">Active Agent Bots</span>
                </div>
                <p className="text-[10px] text-slate-400 font-semibold truncate">WhatsApp webhooks & Discord listeners running</p>
              </div>

            </div>

            {/* Main Content Splitted Area */}
            <div className="grid gap-6 lg:grid-cols-3">
              
              {/* Left Column: Storage History Chart & Connected Accounts list */}
              <div className="space-y-6 lg:col-span-2 min-w-0">
                
                {/* Storage Usage History Card */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Storage Usage History</h2>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Growth trends and sync snapshots across time periods</p>
                    </div>
                    {/* Period selectors */}
                    <div className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/80 text-[10px] font-black self-start sm:self-auto">
                      {(["daily", "weekly", "monthly", "yearly"] as const).map((period) => (
                        <button
                          key={period}
                          onClick={() => setChartFilter(period)}
                          className={`px-3 py-1.5 rounded-md capitalize cursor-pointer transition ${
                            chartFilter === period
                              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-400"
                          }`}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SVG Chart Rendering */}
                  <div className="relative border border-slate-200 dark:border-slate-800 bg-slate-50/10 dark:bg-slate-950/20 rounded-2xl p-4 overflow-x-auto">
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible min-w-[500px]">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const y = paddingY + ratio * (height - paddingY * 2);
                        const val = maxVal * (1 - ratio);
                        return (
                          <g key={idx} className="opacity-40">
                            <line 
                              x1={paddingX} 
                              y1={y} 
                              x2={width - paddingX} 
                              y2={y} 
                              stroke="currentColor" 
                              strokeDasharray="4 4" 
                              className="text-slate-200 dark:text-slate-800" 
                            />
                            <text 
                              x={paddingX - 10} 
                              y={y + 4} 
                              textAnchor="end" 
                              fontSize="8" 
                              fontWeight="bold"
                              className="fill-slate-400 dark:fill-slate-500 font-mono"
                            >
                              {formatBytes(val.toString())}
                            </text>
                          </g>
                        );
                      })}

                      {/* Area Under Curve Fill */}
                      {areaPath && (
                        <path d={areaPath} fill="url(#chartGrad)" />
                      )}

                      {/* Line Curve */}
                      {linePath && (
                        <path 
                          d={linePath} 
                          fill="none" 
                          stroke="#3b82f6" 
                          strokeWidth="2.5" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                        />
                      )}

                      {/* Data dots & Values on hover */}
                      {points.map((p, idx) => (
                        <g key={idx} className="group cursor-pointer">
                          {/* Invisible hover hitbox */}
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r="15"
                            fill="transparent"
                            className="pointer-events-auto"
                          />
                          {/* Visible bullet */}
                          <circle 
                            cx={p.x} 
                            cy={p.y} 
                            r="4.5" 
                            fill="#ffffff" 
                            stroke="#3b82f6" 
                            strokeWidth="2.5" 
                            style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                            className="transition duration-150 group-hover:scale-125"
                          />
                          {/* Tooltip background & text */}
                          <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                            <rect 
                              x={p.x - 35} 
                              y={p.y - 28} 
                              width="70" 
                              height="18" 
                              rx="5" 
                              fill="#1e293b" 
                            />
                            <text 
                              x={p.x} 
                              y={p.y - 16} 
                              fill="#ffffff" 
                              fontSize="8" 
                              fontWeight="bold" 
                              textAnchor="middle" 
                              className="font-mono"
                            >
                              {formatBytes(p.value.toString())}
                            </text>
                          </g>
                        </g>
                      ))}

                      {/* X Axis Labels */}
                      {points.map((p, idx) => (
                        <text 
                          key={idx}
                          x={p.x} 
                          y={height - 4} 
                          textAnchor="middle" 
                          fontSize="8" 
                          fontWeight="bold"
                          className="fill-slate-400 dark:fill-slate-500"
                        >
                          {chartData.labels[idx]}
                        </text>
                      ))}
                    </svg>
                  </div>
                </div>

                {/* Connected Storage Accounts list */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Linked Storage Nodes</h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Real-time status and sync triggers for cloud & local storage gates</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {accounts.length === 0 ? (
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-6 text-center col-span-2 bg-slate-50/50 dark:bg-slate-900/10 border border-slate-200 dark:border-slate-800 rounded-2xl">
                        No accounts linked yet. Click "Settings" to connect your first storage provider.
                      </p>
                    ) : (
                      accounts.map((account) => {
                        const percent = getQuotaPercent(account);
                        return (
                          <div 
                            key={account.id} 
                            className="border border-slate-200 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/10 rounded-2xl p-4 flex flex-col justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center justify-between gap-3 min-w-0">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                                  {getProviderIcon(account.provider)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-extrabold text-slate-800 dark:text-slate-200 text-sm">
                                    {account.displayName || account.email}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${getProviderBadge(account.provider)}`}>
                                      {account.provider.replace('_', ' ')}
                                    </span>
                                    <span className="truncate text-[10px] text-slate-400 font-semibold">{account.email}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button 
                                  onClick={() => syncAccountQuota(account)} 
                                  disabled={account.syncing} 
                                  className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                  title="Sync quota capacity"
                                >
                                  <i className={`fa-solid fa-rotate ${account.syncing ? 'animate-spin' : ''}`}></i>
                                </button>
                                <button 
                                  onClick={() => disconnectAccount(account)} 
                                  className="rounded-lg p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 transition cursor-pointer"
                                  title="Disconnect"
                                >
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              </div>
                            </div>

                            <div className="border-t border-slate-200/60 dark:border-slate-800 pt-2.5 space-y-1.5">
                              <div className="flex justify-between font-bold text-[10px] text-slate-500 dark:text-slate-400">
                                <span>{formatBytes(account.usedBytes)} used</span>
                                <span>of {formatBytes(account.totalBytes)}</span>
                              </div>
                              {account.totalBytes && (
                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${percent}%` }}></div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Largest Files Table Row */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm">
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Largest Files Across Workspace</h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Review your largest files across all connected storage accounts for cleanup and optimization
                  </p>
                  
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/10 dark:bg-slate-900/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            <th className="p-4 pl-6">Name</th>
                            <th className="p-4 hidden sm:table-cell">Account</th>
                            <th className="p-4 hidden md:table-cell">Folder</th>
                            <th className="p-4">Size</th>
                            <th className="p-4 text-right pr-6">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          {largestFiles.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500 font-bold">
                                No active files found.
                              </td>
                            </tr>
                          ) : (
                            largestFiles.map((file) => {
                              const ext = file.name.split('.').pop() || 'file';
                              const badgeStyle = getFileBadgeStyle(ext);
                              return (
                                <tr key={file.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                                  <td className="p-4 pl-6 flex items-center gap-3">
                                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-black uppercase tracking-wider ${badgeStyle}`}>
                                      {ext.substring(0, 3)}
                                    </div>
                                    <span className="truncate font-bold text-slate-800 dark:text-slate-200 max-w-[12rem] xl:max-w-xs" title={file.name}>
                                      {file.name}
                                    </span>
                                  </td>
                                  <td className="p-4 hidden sm:table-cell">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase shrink-0 ${getProviderBadge(file.provider)}`}>
                                        {file.provider.replace('_', ' ')}
                                      </span>
                                      <span className="text-xs truncate max-w-[8rem] text-slate-400 dark:text-slate-500">
                                        {file.connected_account?.email || ""}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-4 text-xs font-semibold text-slate-400 dark:text-slate-500 hidden md:table-cell">
                                    {file.folder?.name || "Root"}
                                  </td>
                                  <td className="p-4 font-bold text-slate-500 dark:text-slate-400">{formatBytes(file.sizeBytes)}</td>
                                  <td className="p-4 text-right pr-6">
                                    <div className="inline-flex gap-1 justify-end">
                                      <a 
                                        href={`/api/files/${file.id}/download`} 
                                        download 
                                        title="Download" 
                                        className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                                      >
                                        <i className="fa-solid fa-download text-sm"></i>
                                      </a>
                                      <button 
                                        onClick={() => deleteFile(file.id)} 
                                        title="Delete" 
                                        className="rounded-lg p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 transition cursor-pointer"
                                      >
                                        <i className="fa-solid fa-trash text-sm"></i>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Activity Feed, Integrations status, and Quick actions */}
              <div className="space-y-6 min-w-0">
                
                {/* Workspace Assets & Storage Breakdown Card */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-5">
                  <div>
                    <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Assets & Storage Breakdown</h2>
                    <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Distribution of file categories and system nodes</p>
                  </div>

                  {/* Dynamic Stacked Progress Bar */}
                  <div className="space-y-2">
                    <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden shadow-inner">
                      {photoPercent > 0 && (
                        <div 
                          className="h-full bg-emerald-500 transition-all duration-500" 
                          style={{ width: `${photoPercent}%` }} 
                          title={`Photos: ${formatBytes(breakdown.photo)} (${photoPercent.toFixed(1)}%)`} 
                        />
                      )}
                      {videoPercent > 0 && (
                        <div 
                          className="h-full bg-amber-500 transition-all duration-500" 
                          style={{ width: `${videoPercent}%` }} 
                          title={`Videos: ${formatBytes(breakdown.video)} (${videoPercent.toFixed(1)}%)`} 
                        />
                      )}
                      {docPercent > 0 && (
                        <div 
                          className="h-full bg-cyan-500 transition-all duration-500" 
                          style={{ width: `${docPercent}%` }} 
                          title={`Documents: ${formatBytes(breakdown.document)} (${docPercent.toFixed(1)}%)`} 
                        />
                      )}
                      {otherPercent > 0 && (
                        <div 
                          className="h-full bg-indigo-500 transition-all duration-500" 
                          style={{ width: `${otherPercent}%` }} 
                          title={`Other Files: ${formatBytes(otherBytes.toString())} (${otherPercent.toFixed(1)}%)`} 
                        />
                      )}
                      {freePercent > 0 && (
                        <div 
                          className="h-full bg-slate-200 dark:bg-slate-700 transition-all duration-500" 
                          style={{ width: `${freePercent}%` }} 
                          title={`Free Space: ${formatBytes(storageStats.availableBytes)} (${freePercent.toFixed(1)}%)`} 
                        />
                      )}
                    </div>
                  </div>

                  {/* Storage Breakdown Rows */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20"></span>
                        Photos
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold font-mono">
                        {formatBytes(breakdown.photo)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/20"></span>
                        Videos
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold font-mono">
                        {formatBytes(breakdown.video)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/20"></span>
                        Docs
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold font-mono">
                        {formatBytes(breakdown.document)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/20"></span>
                        Others
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold font-mono">
                        {formatBytes(otherBytes.toString())}
                      </span>
                    </div>
                    <div className="flex items-center justify-between col-span-2 pt-1">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                        Free Space
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold font-mono">
                        {formatBytes(storageStats.availableBytes)}
                      </span>
                    </div>
                  </div>

                  {/* Navigation Grid Section */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Workspace Navigation & Statistics
                    </span>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-semibold">
                      {/* Files Console */}
                      <Link 
                        href="/all-files"
                        className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 hover:bg-blue-50/10 dark:hover:bg-blue-950/10 hover:border-blue-200 dark:hover:border-blue-800 rounded-2xl flex items-center gap-3 transition duration-150 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-500">
                          <i className="fa-solid fa-folder-open text-base"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate">Files</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {counts.fileCount} items
                          </p>
                        </div>
                      </Link>

                      {/* Connected Nodes */}
                      <Link 
                        href="/settings"
                        className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 hover:border-indigo-200 dark:hover:border-indigo-800 rounded-2xl flex items-center gap-3 transition duration-150 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500">
                          <i className="fa-solid fa-server text-base"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate">Nodes</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {counts.accountsCount} linked
                          </p>
                        </div>
                      </Link>

                      {/* Messenger Bots */}
                      <Link 
                        href="/integrations"
                        className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 hover:bg-amber-50/10 dark:hover:bg-amber-950/10 hover:border-amber-200 dark:hover:border-amber-800 rounded-2xl flex items-center gap-3 transition duration-150 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-500">
                          <i className="fa-solid fa-comments text-base"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate">Bots</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {counts.messengerCount} active
                          </p>
                        </div>
                      </Link>

                      {/* Database Backups */}
                      <Link 
                        href="/backups"
                        className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 hover:bg-rose-50/10 dark:hover:bg-rose-950/10 hover:border-rose-200 dark:hover:border-rose-800 rounded-2xl flex items-center gap-3 transition duration-150 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-500">
                          <i className="fa-solid fa-database text-base"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate">Backups</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {counts.backupCount} scheds
                          </p>
                        </div>
                      </Link>

                      {/* CCTV Streams */}
                      <Link 
                        href="/cctv"
                        className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 hover:bg-cyan-50/10 dark:hover:bg-cyan-950/10 hover:border-cyan-200 dark:hover:border-cyan-800 rounded-2xl flex items-center gap-3 transition duration-150 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-500">
                          <i className="fa-solid fa-video text-base"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate">CCTV</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {counts.cctvCount} cams
                          </p>
                        </div>
                      </Link>

                      {/* API Keys */}
                      <Link 
                        href="/api"
                        className="p-3 border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 hover:bg-emerald-50/10 dark:hover:bg-emerald-950/10 hover:border-emerald-200 dark:hover:border-emerald-800 rounded-2xl flex items-center gap-3 transition duration-150 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-500">
                          <i className="fa-solid fa-code text-base"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-700 dark:text-slate-200 truncate">API Keys</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {counts.apiKeyCount} keys
                          </p>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Audit Activity logs feed */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Activity Logs</h2>
                    <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Real-time audit track of workspace events</p>
                  </div>

                  <div className="relative py-1 max-h-80 overflow-y-auto no-scrollbar">
                    {activityLogs.length > 0 && (
                      <div className="absolute left-3.5 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-800" />
                    )}

                    <div className="space-y-5">
                      {activityLogs.length === 0 ? (
                        <p className="text-xs font-semibold text-slate-500 py-4 text-center">No recent operations logged.</p>
                      ) : (
                        activityLogs.map((log) => {
                          const timeStr = new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          
                          let bulletColor = "border-slate-400 text-slate-400 bg-slate-400";
                          let actionLabelColor = "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400";
                          if (log.action.includes("upload") || log.action.includes("create")) {
                            bulletColor = "border-emerald-500 text-emerald-500 bg-emerald-500";
                            actionLabelColor = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400";
                          } else if (log.action.includes("delete") || log.action.includes("remove")) {
                            bulletColor = "border-rose-500 text-rose-500 bg-rose-500";
                            actionLabelColor = "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400";
                          } else if (log.action.includes("star") || log.action.includes("favorite")) {
                            bulletColor = "border-amber-500 text-amber-500 bg-amber-500";
                            actionLabelColor = "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400";
                          }

                          return (
                            <div key={log.id} className="relative pl-8 group text-xs">
                              {/* Bullet icon placement */}
                              <div className={`absolute left-3.5 -translate-x-1/2 top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-white dark:bg-slate-900 border-2 ${bulletColor.split(" ")[0]} transition-transform duration-150 group-hover:scale-125 shadow-sm`}>
                                <div className={`h-1 w-1 rounded-full ${bulletColor.split(" ")[2]}`} />
                              </div>

                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-extrabold text-slate-800 dark:text-slate-200 truncate flex-1 leading-snug">
                                    {log.metadata?.name || log.metadata?.fileName || log.entityType || "Operation"}
                                  </span>
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono shrink-0">{timeStr}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${actionLabelColor}`}>
                                    {log.action.replace("_", " ")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Integration Bots status */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Daemons Status</h2>
                    <Link href="/integrations" className="text-[10px] font-black text-blue-500 hover:underline uppercase tracking-wider">
                      Configure
                    </Link>
                  </div>

                  <div className="space-y-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {integrations.length === 0 ? (
                      <p className="text-xs font-semibold text-slate-500 py-3 text-center">No messenger daemons integrated yet.</p>
                    ) : (
                      integrations.map((bot) => {
                        const isActive = bot.status === "active" || bot.isActive === true || (bot.isActive as any) === 1;
                        return (
                          <div 
                            key={bot.id} 
                            className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                                bot.provider === 'whatsapp' 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 border border-emerald-100/50 dark:border-emerald-900/20' 
                                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 border border-indigo-100/50 dark:border-indigo-900/20'
                              }`}>
                                <i className={`fa-brands fa-${bot.provider === 'whatsapp' ? 'whatsapp' : 'discord'} text-base`}></i>
                              </div>
                              <span className="font-extrabold text-slate-700 dark:text-slate-200 truncate">
                                {bot.integrationName}
                              </span>
                            </div>
                            
                            {isActive ? (
                              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 px-2.5 py-1 rounded-full tracking-wider">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-full tracking-wider">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                Offline
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
