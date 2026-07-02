"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

export default function RawPathResolverSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Form states
  const [enabled, setEnabled] = useState(true);
  const [accessType, setAccessType] = useState<"authenticated" | "public">("authenticated");
  const [allowedExts, setAllowedExts] = useState("");
  const [blockedExts, setBlockedExts] = useState("");
  const [allowedFolders, setAllowedFolders] = useState("");
  const [blockedFolders, setBlockedFolders] = useState("");

  const loadData = async () => {
    try {
      const res = await fetch("/api/settings/env");
      if (res.ok) {
        const data = await res.json();
        const env = data.env || {};
        setEnabled(env.RAW_RESOLVER_ENABLED !== "false");
        setAccessType(env.RAW_RESOLVER_ACCESS_TYPE === "public" ? "public" : "authenticated");
        setAllowedExts(env.RAW_RESOLVER_ALLOWED_EXTS || "");
        setBlockedExts(env.RAW_RESOLVER_BLOCKED_EXTS || "");
        setAllowedFolders(env.RAW_RESOLVER_ALLOWED_FOLDERS || "");
        setBlockedFolders(env.RAW_RESOLVER_BLOCKED_FOLDERS || "");
      }
    } catch (err) {
      console.error("Failed to load environment for Raw resolver settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env: {
            RAW_RESOLVER_ENABLED: enabled ? "true" : "false",
            RAW_RESOLVER_ACCESS_TYPE: accessType,
            RAW_RESOLVER_ALLOWED_EXTS: allowedExts,
            RAW_RESOLVER_BLOCKED_EXTS: blockedExts,
            RAW_RESOLVER_ALLOWED_FOLDERS: allowedFolders,
            RAW_RESOLVER_BLOCKED_FOLDERS: blockedFolders,
          },
        }),
      });

      if (res.ok) {
        toast.success("Raw path resolver configuration updated successfully.");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update configurations.");
      }
    } catch (err: any) {
      console.error("Failed to save Raw resolver settings:", err);
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const originUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Raw Path Resolver</h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Access files and list directory indexes directly via raw, nested logical filesystem paths
          </p>
        </div>



        {loading ? (
          <div className="grid gap-6 lg:grid-cols-2 w-full animate-pulse">
            <div className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full"></div>
              <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            </div>
            <div className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full"></div>
              <div className="h-36 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 w-full animate-in fade-in duration-200">
            {/* Left Column: Form Settings */}
            <form onSubmit={handleSave} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-sliders text-blue-500"></i> Configuration Panel
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Manage direct path resolver toggle and extension restrictions
                  </p>
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-slate-850 dark:text-slate-200">Enable Raw Path Resolver API</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Allow client requests to fetch data utilizing raw URL path nesting.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={enabled} 
                      onChange={(e) => setEnabled(e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-250 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Access Type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Access Control Mode</label>
                  <select
                    value={accessType}
                    onChange={(e: any) => setAccessType(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs font-semibold focus:border-blue-500 outline-none"
                  >
                    <option value="authenticated">Authenticated (Requires logged-in session or Bearer API token)</option>
                    <option value="public">Public (Exposes directory indexes and streams files to anonymous users)</option>
                  </select>
                </div>

                {/* Allowed Extensions */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Allowed Extensions (Whitelist)</label>
                  <input
                    type="text"
                    value={allowedExts}
                    onChange={(e) => setAllowedExts(e.target.value)}
                    placeholder="e.g. png, jpg, pdf, txt, mp4"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs font-semibold focus:border-blue-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Comma-separated extensions. If configured, only files ending with these types can be requested. Leave blank to allow all.</span>
                </div>

                {/* Blocked Extensions */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Blocked Extensions (Blacklist)</label>
                  <input
                    type="text"
                    value={blockedExts}
                    onChange={(e) => setBlockedExts(e.target.value)}
                    placeholder="e.g. exe, bat, sh, cmd, zip"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs font-semibold focus:border-blue-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Comma-separated extensions. Files matching these types will be blocked from downloading.</span>
                </div>

                {/* Allowed Folders */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Allowed Folders (Whitelist)</label>
                  <input
                    type="text"
                    value={allowedFolders}
                    onChange={(e) => setAllowedFolders(e.target.value)}
                    placeholder="e.g. Public, Shared, Downloads"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs font-semibold focus:border-blue-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Comma-separated folder names. If configured, only these folders can be accessed at the root level. Leave blank to allow all.</span>
                </div>

                {/* Blocked Folders */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Blocked Folders (Blacklist)</label>
                  <input
                    type="text"
                    value={blockedFolders}
                    onChange={(e) => setBlockedFolders(e.target.value)}
                    placeholder="e.g. Private, Backups, Secrets"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 text-xs font-semibold focus:border-blue-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Comma-separated folder names. Access to these folders (and their subfolders) will be completely blocked.</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 mt-6 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <i className="fa-solid fa-circle-notch animate-spin text-sm"></i>
                    Saving Settings...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-floppy-disk text-sm"></i>
                    Save Configurations
                  </>
                )}
              </button>
            </form>

            {/* Right Column: Documentation */}
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-circle-info text-blue-500"></i> API Endpoint Documentation
                </h2>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  How to make use of dynamic directory traversing and streaming
                </p>
              </div>

              <div className="space-y-4 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                <p>
                  The Raw Path Resolver matches your virtual filesystem structure in Clospol exactly, making it trivial to fetch files or integrate lists in other systems.
                </p>

                {/* Example Routes */}
                <div className="space-y-2">
                  <span className="text-[9px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-wider block">Example URL formats</span>
                  <div className="space-y-2">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>List Root Directory</span>
                        <span className="font-mono text-emerald-500 font-bold">GET</span>
                      </div>
                      <code className="block mt-1 font-mono text-[10.5px] text-slate-800 dark:text-slate-250 truncate select-all">
                        {originUrl}/api/raw
                      </code>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>List Nested Folder</span>
                        <span className="font-mono text-emerald-500 font-bold">GET</span>
                      </div>
                      <code className="block mt-1 font-mono text-[10.5px] text-slate-800 dark:text-slate-250 truncate select-all">
                        {originUrl}/api/raw/Documents/Projects
                      </code>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between items-center text-[10px] text-slate-400">
                        <span>Download Raw File Content</span>
                        <span className="font-mono text-emerald-500 font-bold">GET</span>
                      </div>
                      <code className="block mt-1 font-mono text-[10.5px] text-slate-800 dark:text-slate-250 truncate select-all">
                        {originUrl}/api/raw/Documents/Projects/invoice.pdf
                      </code>
                    </div>
                  </div>
                </div>

                {/* Authentication Info */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 space-y-2">
                  <span className="text-[9px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-wider block">Authentication Details</span>
                  {accessType === "public" ? (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold leading-normal">
                      🔓 Currently in PUBLIC mode: Anyone can access, download files, and fetch listings anonymously without credentials.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px]">
                        🔒 Currently in SECURE mode. Requests require authorization. You can fetch resources by passing your Developer API Key in the headers:
                      </p>
                      <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 font-mono text-[10px] select-all overflow-x-auto text-blue-500 dark:text-blue-400">
                        {"Authorization: Bearer <API_KEY>"}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
