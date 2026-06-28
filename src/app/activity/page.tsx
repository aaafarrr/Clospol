"use client";

import React, { useState, useEffect, useMemo } from "react";
import SidebarLayout from "@/components/layout/sidebar";

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: any;
  createdAt: string;
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [selectedActionType, setSelectedActionType] = useState<string>("all");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/activity/logs", {
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatActionName = (action: string) => {
    return action.replace(/_/g, " ");
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "register":
        return "fa-user-plus";
      case "login":
        return "fa-right-to-bracket";
      case "connect_account":
        return "fa-plug";
      case "upload":
        return "fa-cloud-arrow-up";
      case "delete_file":
      case "delete_folder":
        return "fa-trash-can";
      case "share_link":
        return "fa-share-nodes";
      case "invite_collaborator":
        return "fa-user-tag";
      case "update_profile":
        return "fa-user-pen";
      case "change_password":
        return "fa-key";
      default:
        return "fa-circle-info";
    }
  };

  const getIconColorClass = (action: string) => {
    switch (action) {
      case "register":
      case "login":
        return "text-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20";
      case "connect_account":
        return "text-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20";
      case "upload":
        return "text-blue-500 bg-blue-50/50 dark:bg-blue-950/20";
      case "delete_file":
      case "delete_folder":
        return "text-red-500 bg-red-50/50 dark:bg-red-950/20";
      case "share_link":
      case "invite_collaborator":
        return "text-amber-500 bg-amber-50/50 dark:bg-amber-950/20";
      case "update_profile":
      case "change_password":
        return "text-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20";
      default:
        return "text-slate-500 bg-slate-50/50 dark:bg-slate-950/20";
    }
  };

  const formatBytes = (bytes: any) => {
    const parsed = parseInt(bytes);
    if (isNaN(parsed) || parsed === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(parsed) / Math.log(k));
    return parseFloat((parsed / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getLogMessage = (log: AuditLog) => {
    const meta = log.metadata || {};
    switch (log.action) {
      case "register":
        return `Created your Clospol account. Welcome!`;
      case "login":
        return `Logged in successfully.`;
      case "connect_account":
        return `Connected <span class="text-blue-600 dark:text-blue-400 font-extrabold">${
          meta.provider ? meta.provider.replace(/_/g, " ") : "Google Drive"
        }</span> account: <span class="font-black">${meta.email || ""}</span>`;
      case "upload":
        return `Uploaded file <span class="font-extrabold text-slate-800 dark:text-slate-100">${
          meta.name || "file"
        }</span> (${formatBytes(meta.sizeBytes)})`;
      case "delete_file":
        return `Moved file <span class="font-extrabold text-slate-800 dark:text-slate-100">${
          meta.name || "file"
        }</span> to Trash`;
      case "delete_folder":
        return `Moved virtual directory <span class="font-extrabold text-slate-800 dark:text-slate-100">${
          meta.name || "folder"
        }</span> to Trash`;
      case "share_link":
        return `Created a public share link for <span class="font-extrabold text-slate-800 dark:text-slate-100">${
          meta.name || "file"
        }</span>`;
      case "invite_collaborator":
        return `Invited <span class="font-black">${
          meta.email || ""
        }</span> to collaborate on <span class="font-extrabold text-slate-800 dark:text-slate-100">${
          meta.name || "file"
        }</span> as <span class="text-blue-600 dark:text-blue-400">${
          meta.role || "viewer"
        }</span>`;
      case "update_profile":
        return `Updated profile information.`;
      case "change_password":
        return `Changed account security credentials (password).`;
      default:
        return `Performed action: ${log.action}`;
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  // Filter logs based on search query, action type and selected date
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const dateMatch = selectedDate
        ? new Date(log.createdAt).toISOString().split("T")[0] === selectedDate
        : true;

      const actionMatch = selectedActionType === "all"
        ? true
        : log.action === selectedActionType;

      const queryMatch = searchQuery
        ? log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (log.metadata?.name && log.metadata.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (log.metadata?.email && log.metadata.email.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;

      return dateMatch && actionMatch && queryMatch;
    });
  }, [logs, selectedDate, selectedActionType, searchQuery]);

  // Group filtered logs by date for display
  const groupedLogs = useMemo(() => {
    const groups: Record<string, AuditLog[]> = {};
    filteredLogs.forEach((log) => {
      const dateStr = new Date(log.createdAt).toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(log);
    });
    return groups;
  }, [filteredLogs]);

  // Daily statistics calculations for dashboard summary cards
  const stats = useMemo(() => {
    const dayLogs = selectedDate
      ? logs.filter(l => new Date(l.createdAt).toISOString().split("T")[0] === selectedDate)
      : logs;

    return {
      total: dayLogs.length,
      uploads: dayLogs.filter(l => l.action === "upload").length,
      logins: dayLogs.filter(l => l.action === "login" || l.action === "register").length,
      deletions: dayLogs.filter(l => l.action === "delete_file" || l.action === "delete_folder").length,
    };
  }, [logs, selectedDate]);

  // Get distinct list of days that have activity to show in quick filter
  const activityDays = useMemo(() => {
    const days = new Set<string>();
    logs.forEach(l => {
      days.add(new Date(l.createdAt).toISOString().split("T")[0]);
    });
    return Array.from(days).sort().reverse().slice(0, 7); // recent 7 days
  }, [logs]);

  return (
    <SidebarLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">
              Security & Activity Audit
            </h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
              Real-time records of security, access, and file operations executed on your account.
            </p>
          </div>
          
          <button 
            onClick={fetchLogs}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer bg-white dark:bg-slate-900 shadow-sm"
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? "animate-spin" : ""}`}></i>
            Refresh Logs
          </button>
        </div>

        {/* Daily Stats Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Operations", count: stats.total, icon: "fa-list-check", color: "text-blue-500 bg-blue-500/10" },
            { label: "Uploads", count: stats.uploads, icon: "fa-cloud-arrow-up", color: "text-emerald-500 bg-emerald-500/10" },
            { label: "Logins & Security", count: stats.logins, icon: "fa-right-to-bracket", color: "text-indigo-500 bg-indigo-500/10" },
            { label: "Deletions (Trash)", count: stats.deletions, icon: "fa-trash-can", color: "text-red-500 bg-red-500/10" }
          ].map((card, i) => (
            <div key={i} className="glass-panel p-4.5 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
                  {selectedDate ? "Daily " : "Total "}{card.label}
                </span>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{card.count}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color} text-lg`}>
                <i className={`fa-solid ${card.icon}`}></i>
              </div>
            </div>
          ))}
        </div>

        {/* Filters Controls Panel */}
        <div className="glass-panel p-4.5 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-center shadow-sm">
          {/* Text Search */}
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input 
              type="text" 
              placeholder="Search actions or files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs glass-input"
            />
          </div>

          {/* Date Picker Filter */}
          <div className="relative">
            <i className="fa-solid fa-calendar-day absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs glass-input cursor-pointer"
            />
          </div>

          {/* Action Type Filter */}
          <div className="relative">
            <i className="fa-solid fa-sliders absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <select
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs glass-input cursor-pointer appearance-none"
            >
              <option value="all">All Actions</option>
              <option value="login">Logins</option>
              <option value="register">Account Creations</option>
              <option value="upload">Uploads</option>
              <option value="delete_file">File Deletions</option>
              <option value="delete_folder">Folder Deletions</option>
              <option value="share_link">Public Share Links</option>
              <option value="invite_collaborator">Collaboration Invites</option>
              <option value="update_profile">Profile Updates</option>
              <option value="change_password">Security Updates</option>
            </select>
            <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
          </div>

          {/* Reset Filters */}
          <div className="flex gap-2">
            {(selectedDate || selectedActionType !== "all" || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedDate("");
                  setSelectedActionType("all");
                  setSearchQuery("");
                }}
                className="flex-1 py-2 px-3 text-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                setSelectedDate(today);
              }}
              className={`flex-1 py-2 px-3 text-center rounded-xl border text-xs font-bold transition cursor-pointer ${
                selectedDate === new Date().toISOString().split("T")[0]
                  ? "bg-blue-600/10 border-blue-500/30 text-blue-500"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80"
              }`}
            >
              Today
            </button>
          </div>
        </div>

        {/* Quick Date Tabs Filter Row */}
        {activityDays.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="font-bold text-slate-400 dark:text-slate-500 pr-2 shrink-0">Filter by Day:</span>
            <button
              onClick={() => setSelectedDate("")}
              className={`px-3 py-1.5 rounded-full font-bold border transition cursor-pointer shrink-0 ${
                !selectedDate 
                  ? "bg-blue-600 border-blue-600 text-white" 
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              All Days
            </button>
            {activityDays.map((day) => {
              const formattedTab = new Date(day).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              });
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(day)}
                  className={`px-3 py-1.5 rounded-full font-bold border transition cursor-pointer shrink-0 ${
                    selectedDate === day 
                      ? "bg-blue-600 border-blue-600 text-white" 
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {formattedTab}
                </button>
              );
            })}
          </div>
        )}

        {/* Audit Log Content Container */}
        {loading ? (
          <div className="space-y-6 max-w-3xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 items-start animate-pulse">
                <div className="h-10 w-10 bg-slate-200 dark:bg-slate-800 rounded-full shrink-0"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3"></div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {Object.keys(groupedLogs).length === 0 ? (
              <div className="glass-panel p-16 text-center rounded-2xl flex flex-col items-center justify-center max-w-md mx-auto">
                <i className="fa-solid fa-clock-rotate-left text-slate-400 dark:text-slate-600 text-3xl mb-4"></i>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No activity matches
                </h3>
                <p className="text-xs text-slate-500 font-semibold max-w-sm">
                  Try clearing your filter parameters or selecting a different date.
                </p>
              </div>
            ) : (
              /* Grouped Timelines */
              <div className="space-y-10">
                {Object.entries(groupedLogs).map(([dateLabel, dayLogs]) => (
                  <div key={dateLabel} className="space-y-4">
                    {/* Sticky Day Label */}
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 px-3 py-1 rounded-full border border-slate-202 dark:border-slate-800/80 shadow-xs">
                        {dateLabel}
                      </h3>
                      <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800/50"></div>
                    </div>

                    {/* Timeline path for the day */}
                    <div className="relative pl-8 border-l border-slate-200 dark:border-slate-800 space-y-5 py-2 ml-4">
                      {dayLogs.map((log) => (
                        <div key={log.id} className="relative group flex flex-col">
                          {/* Timeline Dot / Icon wrapper */}
                          <div
                            className={`absolute -left-[3.15rem] top-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md group-hover:scale-105 group-hover:border-blue-500 dark:group-hover:border-blue-500 transition duration-150 ${getIconColorClass(
                              log.action
                            )}`}
                          >
                            <i className={`fa-solid text-sm ${getActionIcon(log.action)}`}></i>
                          </div>

                          {/* Timeline Content Card */}
                          <div className="rounded-2xl border border-slate-200/50 bg-white dark:border-slate-800/50 dark:bg-slate-900/40 p-4.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 flex items-start justify-between gap-4">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                  {formatActionName(log.action)}
                                </span>
                              </div>
                              <h4
                                className="text-sm font-bold text-slate-705 dark:text-slate-200 leading-relaxed"
                                dangerouslySetInnerHTML={{
                                  __html: getLogMessage(log),
                                }}
                              ></h4>
                            </div>

                            <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800/40 shrink-0 self-start font-mono">
                              {formatTime(log.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
