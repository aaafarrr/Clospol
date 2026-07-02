"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

export default function WebDAVAccessPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_WEBDAV === "false") {
    return (
      <SidebarLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4 animate-in fade-in duration-200">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-2xl shadow-sm">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">WebDAV Feature Disabled</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            The WebDAV gateway mounting access has been disabled during installation. Contact your administrator or update your environment configuration to enable this module.
          </p>
        </div>
      </SidebarLayout>
    );
  }

  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [webdavOs, setWebdavOs] = useState<"win" | "mac" | "linux">("win");

  const loadData = async () => {
    try {
      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.user) {
          setEmail(userData.user.email);
        }
      }
    } catch (err) {
      console.error("Failed to load user profile for WebDAV info:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">WebDAV Access</h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Access your virtual filesystems and files directly from your desktop explorer using the WebDAV gateway protocol
          </p>
        </div>



        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 w-full animate-pulse">
            <div className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-4 w-60 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            </div>
            <div className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-4 w-60 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 w-full animate-in fade-in duration-200">
            {/* Left Column: Credentials & Notice */}
            <div className="space-y-6">
              {/* WebDAV Connection Assistant */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-folder-tree text-blue-500"></i> WebDAV Connection Details
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Use these credentials to map Clospol as a local storage drive
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between min-h-16">
                    <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-black tracking-wider">Connection WebDAV URL</span>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <code className="text-slate-850 dark:text-slate-200 truncate text-[11.5px] font-mono select-all">
                        {typeof window !== "undefined" ? `${window.location.origin}/dav` : "/dav"}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/dav`);
                          toast.success("WebDAV Connection URL copied to clipboard.");
                        }}
                        className="text-blue-500 hover:text-blue-700 font-bold shrink-0 cursor-pointer"
                        title="Copy URL"
                      >
                        <i className="fa-solid fa-copy text-sm"></i>
                      </button>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between min-h-16">
                    <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-black tracking-wider">Username / Email</span>
                    <span className="text-slate-850 dark:text-slate-200 block truncate mt-1 text-[11.5px] font-bold select-all">{email}</span>
                  </div>
                </div>
              </div>

              {/* Security Notice */}
              <div className="rounded-2xl border border-amber-200/50 bg-amber-500/5 dark:border-amber-900/30 p-4 text-xs font-semibold text-amber-700 dark:text-amber-400 space-y-1.5 leading-normal">
                <div className="flex items-center gap-1.5 font-black uppercase text-[10px] tracking-wide text-amber-600 dark:text-amber-300">
                  <i className="fa-solid fa-triangle-exclamation text-xs"></i>
                  <span>Important Security Notice</span>
                </div>
                <p>WebDAV operates directly as a file access gateway. For security, do not share your primary account password or WebDAV mount links. Use local mount parameters that save authentication credentials securely in your operating system credential manager.</p>
              </div>
            </div>

            {/* Right Column: Setup Guides */}
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <i className="fa-solid fa-desktop text-blue-500"></i> Client Configuration Guide
                </h2>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  Step-by-step operating system connection instructions
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/20 dark:bg-slate-950/20">
                <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  <button
                    type="button"
                    onClick={() => setWebdavOs("win")}
                    className={`flex-1 py-2.5 text-center text-xs font-black transition cursor-pointer ${
                      webdavOs === "win"
                        ? "text-blue-600 bg-white dark:bg-slate-900 border-b border-blue-500"
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    }`}
                  >
                    Windows Explorer
                  </button>
                  <button
                    type="button"
                    onClick={() => setWebdavOs("mac")}
                    className={`flex-1 py-2.5 text-center text-xs font-black transition cursor-pointer ${
                      webdavOs === "mac"
                        ? "text-blue-600 bg-white dark:bg-slate-900 border-b border-blue-500"
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    }`}
                  >
                    macOS Finder
                  </button>
                  <button
                    type="button"
                    onClick={() => setWebdavOs("linux")}
                    className={`flex-1 py-2.5 text-center text-xs font-black transition cursor-pointer ${
                      webdavOs === "linux"
                        ? "text-blue-600 bg-white dark:bg-slate-900 border-b border-blue-500"
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                    }`}
                  >
                    Linux File Manager
                  </button>
                </div>
                <div className="p-5 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed min-h-[120px]">
                  {webdavOs === "win" && (
                    <ol className="list-decimal pl-4 space-y-1.5 font-semibold">
                      <li>Open <strong>File Explorer</strong> and go to <strong>This PC</strong>.</li>
                      <li>Click <strong>Map network drive</strong> in the top ribbon menu.</li>
                      <li>Enter the Connection URL shown in connection details in the Folder path field.</li>
                      <li>Check the checkbox for <strong>Connect using different credentials</strong> and click <strong>Finish</strong>.</li>
                      <li>Enter your Clospol email and account password in the authentication popup to map the drive.</li>
                    </ol>
                  )}
                  {webdavOs === "mac" && (
                    <ol className="list-decimal pl-4 space-y-1.5 font-semibold">
                      <li>Open <strong>Finder</strong> and press key combination <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border dark:border-slate-700 text-[10px] font-mono">Cmd + K</kbd></li>
                      <li>Type or paste the Connection WebDAV URL shown in connection details and click <strong>Connect</strong>.</li>
                      <li>Select <strong>Registered User</strong>, input your Clospol email and password, and click connect.</li>
                    </ol>
                  )}
                  {webdavOs === "linux" && (
                    <div className="space-y-2">
                      <p>Connect using your desktop file manager (e.g. Nautilus, Dolphin, or Thunar) with the following virtual path format:</p>
                      <code className="block bg-slate-100 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-[10.5px] select-all text-blue-500 dark:text-blue-400">
                        {typeof window !== "undefined" ? `davs://${window.location.host}/dav` : "davs://localhost:3000/dav"}
                      </code>
                      <p className="mt-1">Or mount the filesystem via the terminal command line utilizing the <code>mount -t davfs</code> package utility.</p>
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
