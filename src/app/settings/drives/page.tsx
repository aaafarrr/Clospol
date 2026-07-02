"use client";

import React, { useState, useEffect, useRef } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

interface ConnectedAccount {
  id: string;
  provider: string;
  displayName: string;
  email: string;
}

export default function ConnectedDrivesPage() {
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // Storage Accounts
  const [googleAccounts, setGoogleAccounts] = useState<ConnectedAccount[]>([]);
  const [onedriveAccounts, setOnedriveAccounts] = useState<ConnectedAccount[]>([]);
  const [dropboxAccounts, setDropboxAccounts] = useState<ConnectedAccount[]>([]);
  const [customAccounts, setCustomAccounts] = useState<ConnectedAccount[]>([]);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingOnedrive, setLinkingOnedrive] = useState(false);
  const [linkingDropbox, setLinkingDropbox] = useState(false);

  // Google Credentials form
  const [showOAuthHelp, setShowOAuthHelp] = useState(true);
  const [googleCreds, setGoogleCreds] = useState({
    clientId: "",
    clientSecret: "",
    redirectUri: "",
    scopes: "https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile",
    loading: false,
  });

  // Global env variables list
  const [envConfig, setEnvConfig] = useState<Record<string, string>>({});

  // S3 & Local Storage connection states
  const [showS3Modal, setShowS3Modal] = useState(false);
  const [showLocalModal, setShowLocalModal] = useState(false);
  const s3ModalRef = useRef<HTMLDivElement>(null);
  const localModalRef = useRef<HTMLDivElement>(null);

  const [s3Form, setS3Form] = useState({
    name: "",
    bucket: "",
    region: "",
    endpoint: "",
    accessKeyId: "",
    secretAccessKey: "",
    forcePathStyle: false,
    prefix: "clospol",
    quotaBytes: "",
    loading: false,
  });

  const [localForm, setLocalForm] = useState({
    name: "",
    path: "",
    quotaBytes: "",
    loading: false,
  });

  // Edit Local storage modal
  const [showEditLocalModal, setShowEditLocalModal] = useState(false);
  const [editLocalForm, setEditLocalForm] = useState({
    id: "",
    name: "",
    path: "",
    quotaBytes: "",
    loading: false,
  });
  const editLocalModalRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      // 1. Fetch connected accounts
      const accountsRes = await fetch("/api/storages");
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const list: ConnectedAccount[] = accountsData.accounts || [];
        setGoogleAccounts(list.filter((acc) => acc.provider === "google_drive"));
        setOnedriveAccounts(list.filter((acc) => acc.provider === "onedrive"));
        setDropboxAccounts(list.filter((acc) => acc.provider === "dropbox"));
        setCustomAccounts(list.filter((acc) => acc.provider === "s3" || acc.provider === "local"));
      }

      // 2. Fetch env configuration (Google creds)
      const envRes = await fetch("/api/settings/env");
      if (envRes.ok) {
        const envData = await envRes.json();
        const env = envData.env || {};
        setEnvConfig(env);
        setGoogleCreds({
          clientId: env.GOOGLE_CLIENT_ID || "",
          clientSecret: env.GOOGLE_CLIENT_SECRET || "",
          redirectUri: env.GOOGLE_REDIRECT_URI || `${window.location.origin}/api/oauth/google/callback`,
          scopes: env.GOOGLE_SCOPES || "https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile",
          loading: false,
        });
      }
    } catch (err) {
      console.error("Failed to load connected drives data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "clospol:google-connected") {
        if (event.data.status === "success") {
          toast.success("Google Drive account connected successfully.");
          loadData();
          window.dispatchEvent(new CustomEvent("storage-changed"));
        } else {
          toast.error("Google connection failed.");
        }
        setLinkingGoogle(false);
      }
      if (event.data && event.data.type === "clospol:onedrive-connected") {
        if (event.data.status === "success") {
          toast.success("Microsoft OneDrive account connected successfully.");
          loadData();
          window.dispatchEvent(new CustomEvent("storage-changed"));
        } else {
          toast.error("OneDrive connection failed: " + (event.data.message || "Unknown error"));
        }
        setLinkingOnedrive(false);
      }
      if (event.data && event.data.type === "clospol:dropbox-connected") {
        if (event.data.status === "success") {
          toast.success("Dropbox account connected successfully.");
          loadData();
          window.dispatchEvent(new CustomEvent("storage-changed"));
        } else {
          toast.error("Dropbox connection failed: " + (event.data.message || "Unknown error"));
        }
        setLinkingDropbox(false);
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  // Close modals clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (editLocalModalRef.current && !editLocalModalRef.current.contains(target)) {
        setShowEditLocalModal(false);
      }
      if (s3ModalRef.current && !s3ModalRef.current.contains(target)) {
        setShowS3Modal(false);
      }
      if (localModalRef.current && !localModalRef.current.contains(target)) {
        setShowLocalModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const linkGoogleAccount = () => {
    if (!envConfig.GOOGLE_CLIENT_ID || !envConfig.GOOGLE_CLIENT_SECRET) {
      if (confirm("Google Drive integration requires Google OAuth Client credentials first. Would you like to go to the Settings page to configure them now?")) {
        window.location.href = "/settings/system?tab=system";
      }
      return;
    }
    setLinkingGoogle(true);
    const width = 600;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      "/api/storages/google/connect",
      "GoogleDriveOAuth",
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );
  };

  const linkOnedriveAccount = () => {
    if (!envConfig.ONEDRIVE_CLIENT_ID || !envConfig.ONEDRIVE_CLIENT_SECRET) {
      if (confirm("Microsoft OneDrive integration requires OneDrive OAuth Client credentials first. Would you like to go to the Settings page to configure them now?")) {
        window.location.href = "/settings/system?tab=system";
      }
      return;
    }
    setLinkingOnedrive(true);
    const width = 600;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      "/api/storages/onedrive/connect",
      "OneDriveOAuth",
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );
  };

  const linkDropboxAccount = () => {
    if (!envConfig.DROPBOX_CLIENT_ID || !envConfig.DROPBOX_CLIENT_SECRET) {
      if (confirm("Dropbox integration requires Dropbox OAuth Client credentials first. Would you like to go to the Settings page to configure them now?")) {
        window.location.href = "/settings/system?tab=system";
      }
      return;
    }
    setLinkingDropbox(true);
    const width = 600;
    const height = 650;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      "/api/storages/dropbox/connect",
      "DropboxOAuth",
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
    );
  };

  const disconnectAccount = async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this storage account? This will hide its files and suspend uploads to this destination.")) {
      return;
    }
    try {
      const res = await fetch(`/api/storages/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Account disconnected successfully.");
        loadData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to disconnect account.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while disconnecting the account.");
    }
  };

  const saveGoogleConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoogleCreds((prev) => ({ ...prev, loading: true }));
    try {
      const updatedEnv = {
        ...envConfig,
        GOOGLE_CLIENT_ID: googleCreds.clientId,
        GOOGLE_CLIENT_SECRET: googleCreds.clientSecret,
        GOOGLE_REDIRECT_URI: googleCreds.redirectUri,
        GOOGLE_SCOPES: googleCreds.scopes,
      };
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env: updatedEnv }),
      });
      if (res.ok) {
        toast.success("Google OAuth client configurations saved successfully.");
        loadData();
      } else {
        toast.error("Failed to save credentials.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while saving Google credentials.");
    } finally {
      setGoogleCreds((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleConnectS3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setS3Form((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/storages/s3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: s3Form.name,
          bucket: s3Form.bucket,
          region: s3Form.region,
          endpoint: s3Form.endpoint || null,
          accessKeyId: s3Form.accessKeyId,
          secretAccessKey: s3Form.secretAccessKey,
          forcePathStyle: s3Form.forcePathStyle,
          prefix: s3Form.prefix || "clospol",
          quotaBytes: s3Form.quotaBytes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`S3 Bucket ${s3Form.bucket} successfully connected.`);
        setShowS3Modal(false);
        setS3Form({
          name: "",
          bucket: "",
          region: "",
          endpoint: "",
          accessKeyId: "",
          secretAccessKey: "",
          forcePathStyle: false,
          prefix: "clospol",
          quotaBytes: "",
          loading: false,
        });
        loadData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("S3 Error: " + (data.message || data.error || "Connection failed"));
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while connecting S3 storage.");
    } finally {
      setS3Form((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleConnectLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalForm((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/storages/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: localForm.name,
          path: localForm.path,
          quotaBytes: localForm.quotaBytes || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Local Storage ${localForm.name} successfully connected.`);
        setShowLocalModal(false);
        setLocalForm({
          name: "",
          path: "",
          quotaBytes: "",
          loading: false,
        });
        loadData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Local Storage Error: " + (data.message || data.error || "Connection failed"));
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while connecting local storage.");
    } finally {
      setLocalForm((prev) => ({ ...prev, loading: false }));
    }
  };

  const openEditLocalModal = (account: ConnectedAccount) => {
    setEditLocalForm({
      id: account.id,
      name: account.displayName,
      path: "",
      quotaBytes: "",
      loading: false,
    });
    setShowEditLocalModal(true);

    fetch(`/api/storages/${account.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.account && data.account.localStorageConfig) {
          setEditLocalForm((prev) => ({
            ...prev,
            path: data.account.localStorageConfig.serverPath,
            quotaBytes: data.account.localStorageConfig.quotaBytes ? data.account.localStorageConfig.quotaBytes.toString() : "",
          }));
        }
      })
      .catch((err) => console.error("Error loading local config details:", err));
  };

  const updateLocalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditLocalForm((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/storages/${editLocalForm.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editLocalForm.name,
          path: editLocalForm.path,
          quotaBytes: editLocalForm.quotaBytes || null,
        }),
      });
      if (res.ok) {
        toast.success("Local storage configuration updated successfully.");
        setShowEditLocalModal(false);
        loadData();
        window.dispatchEvent(new CustomEvent("storage-changed"));
      } else {
        toast.error("Failed to update config.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while updating configuration.");
    } finally {
      setEditLocalForm((prev) => ({ ...prev, loading: false }));
    }
  };

  const isGoogleConfigured = !!(envConfig.GOOGLE_CLIENT_ID && envConfig.GOOGLE_CLIENT_SECRET);
  const isOnedriveConfigured = !!(envConfig.ONEDRIVE_CLIENT_ID && envConfig.ONEDRIVE_CLIENT_SECRET);
  const isDropboxConfigured = !!(envConfig.DROPBOX_CLIENT_ID && envConfig.DROPBOX_CLIENT_SECRET);

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <i className="fa-solid fa-link text-blue-500"></i> Connected Drives
          </h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Mount and manage cloud storage and local physical partitions in your gateway routing grid
          </p>
        </div>



        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 w-full animate-pulse">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4"
              >
                <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-4 w-60 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 w-full items-start animate-in fade-in duration-200">
            <div className="space-y-6 min-w-0">
              {/* Connect Storage Provider Card */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-cloud-arrow-up text-blue-500"></i> Connect Storage Provider
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Add a new cloud or local storage node to your workspace
                  </p>
                </div>

                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                  <button
                    onClick={linkGoogleAccount}
                    disabled={linkingGoogle}
                    className={`h-11 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                      isGoogleConfigured
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10"
                        : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 dark:text-amber-400"
                    }`}
                  >
                    <i className={`fa-solid ${isGoogleConfigured ? "fa-link" : "fa-triangle-exclamation"} text-xs`}></i>
                    Google Drive
                  </button>

                  <button
                    onClick={linkOnedriveAccount}
                    disabled={linkingOnedrive}
                    className={`h-11 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                      isOnedriveConfigured
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10"
                        : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 dark:text-amber-400"
                    }`}
                  >
                    <i className={`fa-solid ${isOnedriveConfigured ? "fa-link" : "fa-triangle-exclamation"} text-xs`}></i>
                    OneDrive
                  </button>

                  <button
                    onClick={linkDropboxAccount}
                    disabled={linkingDropbox}
                    className={`h-11 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer ${
                      isDropboxConfigured
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10"
                        : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 dark:text-amber-400"
                    }`}
                  >
                    <i className={`fa-solid ${isDropboxConfigured ? "fa-link" : "fa-triangle-exclamation"} text-xs`}></i>
                    Dropbox
                  </button>

                  <button
                    onClick={() => {
                      setS3Form({
                        name: "Backblaze B2 Storage",
                        bucket: "",
                        region: "us-west-004",
                        endpoint: "https://s3.us-west-004.backblazeb2.com",
                        accessKeyId: "",
                        secretAccessKey: "",
                        forcePathStyle: true,
                        prefix: "clospol",
                        quotaBytes: "",
                        loading: false,
                      });
                      setShowS3Modal(true);
                    }}
                    className="h-11 bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 dark:hover:bg-slate-800 rounded-xl font-bold text-xs shadow-md shadow-slate-900/10 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-fire text-xs text-orange-500"></i>
                    Backblaze B2
                  </button>

                  <button
                    onClick={() => {
                      setS3Form({
                        name: "Custom S3 Storage",
                        bucket: "",
                        region: "",
                        endpoint: "",
                        accessKeyId: "",
                        secretAccessKey: "",
                        forcePathStyle: false,
                        prefix: "clospol",
                        quotaBytes: "",
                        loading: false,
                      });
                      setShowS3Modal(true);
                    }}
                    className="h-11 bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 dark:hover:bg-slate-800 rounded-xl font-bold text-xs shadow-md shadow-slate-900/10 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-cubes text-xs"></i>
                    Custom S3 Bucket
                  </button>

                  <button
                    onClick={() => setShowLocalModal(true)}
                    className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-500/10 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-folder-closed text-xs"></i>
                    Local Directory
                  </button>
                </div>

                {/* Credentials Warning Banners */}
                {(!isGoogleConfigured || !isOnedriveConfigured || !isDropboxConfigured) && (
                  <div className="p-3.5 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-2xl flex flex-col gap-2.5 text-xs font-semibold leading-relaxed">
                    <div className="flex items-start gap-2">
                      <i className="fa-solid fa-circle-exclamation text-amber-500 text-sm mt-0.5 shrink-0"></i>
                      <div className="space-y-1">
                        <span className="font-black uppercase tracking-wider block text-[10px] text-amber-800 dark:text-amber-300">Unconfigured API Providers:</span>
                        <ul className="list-disc pl-4 space-y-1 text-[11px]">
                          {!isGoogleConfigured && (
                            <li>Google Drive API requires Google OAuth credentials.</li>
                          )}
                          {!isOnedriveConfigured && (
                            <li>OneDrive API requires Microsoft Graph OAuth credentials.</li>
                          )}
                          {!isDropboxConfigured && (
                            <li>Dropbox API requires Dropbox OAuth credentials.</li>
                          )}
                        </ul>
                        <p className="mt-2 text-[10px]">
                          <a href="/settings/system?tab=system" className="text-blue-500 hover:underline font-bold">
                            Configure Client Credentials here &rarr;
                          </a>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6 min-w-0">
              {/* Active Storage Connections Card */}
              <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-network-wired text-blue-500"></i> Active Connections
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Manage connected drive instances, directory paths, and object storage buckets.
                  </p>
                </div>

                <div className="space-y-4">
                  {googleAccounts.length === 0 && onedriveAccounts.length === 0 && dropboxAccounts.length === 0 && customAccounts.length === 0 ? (
                    <p className="text-xs font-bold text-slate-450 dark:text-slate-550 py-8 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150/40 dark:border-slate-800 rounded-2xl">
                      No active storage connections linked yet. Mount a provider to get started.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Google Drive list */}
                      {googleAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="border border-slate-200/50 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-950/10 rounded-2xl p-4 flex items-center justify-between gap-4 transition hover:border-slate-300 dark:hover:border-slate-700"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-black flex items-center justify-center uppercase text-sm">
                              {account.email.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="truncate font-black text-slate-800 dark:text-slate-200 text-sm">{account.displayName || "Google Drive"}</p>
                                <span className="rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-150/40 dark:border-blue-900/30 px-1.5 py-0.5 text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase">
                                  Google Drive
                                </span>
                              </div>
                              <p className="truncate text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">{account.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => disconnectAccount(account.id)}
                            className="rounded-xl p-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-500 transition cursor-pointer"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      ))}

                      {/* OneDrive list */}
                      {onedriveAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="border border-slate-200/50 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-950/10 rounded-2xl p-4 flex items-center justify-between gap-4 transition hover:border-slate-300 dark:hover:border-slate-700"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-black flex items-center justify-center uppercase text-sm border border-blue-100/30 shrink-0">
                              <i className="fa-brands fa-microsoft text-base text-blue-600"></i>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="truncate font-black text-slate-800 dark:text-slate-200 text-sm">{account.displayName || "OneDrive"}</p>
                                <span className="rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-150/40 dark:border-blue-900/30 px-1.5 py-0.5 text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase">
                                  OneDrive
                                </span>
                              </div>
                              <p className="truncate text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">{account.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => disconnectAccount(account.id)}
                            className="rounded-xl p-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-500 transition cursor-pointer"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      ))}

                      {/* Dropbox list */}
                      {dropboxAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="border border-slate-200/50 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-950/10 rounded-2xl p-4 flex items-center justify-between gap-4 transition hover:border-slate-300 dark:hover:border-slate-700"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-black flex items-center justify-center uppercase text-sm border border-blue-100/30 shrink-0">
                              <i className="fa-brands fa-dropbox text-base text-blue-500"></i>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="truncate font-black text-slate-800 dark:text-slate-200 text-sm">{account.displayName || "Dropbox"}</p>
                                <span className="rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-150/40 dark:border-blue-900/30 px-1.5 py-0.5 text-[8px] font-black text-blue-600 dark:text-blue-400 uppercase">
                                  Dropbox
                                </span>
                              </div>
                              <p className="truncate text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">{account.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => disconnectAccount(account.id)}
                            className="rounded-xl p-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-500 transition cursor-pointer"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      ))}

                      {/* Custom and Local list */}
                      {customAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="border border-slate-200/50 dark:border-slate-850 bg-slate-50/20 dark:bg-slate-950/10 rounded-2xl p-4 flex items-center justify-between gap-4 transition hover:border-slate-300 dark:hover:border-slate-700"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`h-10 w-10 rounded-xl font-bold flex items-center justify-center shrink-0 uppercase text-xs border border-slate-150/40 dark:border-slate-800 ${
                              account.provider === "s3"
                                ? "bg-amber-500/5 text-amber-500"
                                : "bg-emerald-500/5 text-emerald-500"
                            }`}>
                              {account.provider === "s3" ? (
                                <i className="fa-solid fa-cubes text-sm"></i>
                              ) : (
                                <i className="fa-solid fa-folder-closed text-sm"></i>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="truncate font-black text-slate-800 dark:text-slate-200 text-sm">{account.displayName}</p>
                                <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase shrink-0 ${
                                  account.provider === "s3"
                                    ? "bg-amber-500/5 border-amber-250/30 text-amber-500"
                                    : "bg-emerald-500/5 border-emerald-250/30 text-emerald-500"
                                }`}>
                                  {account.provider}
                                </span>
                              </div>
                              <p className="truncate text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">{account.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {account.provider === "local" && (
                              <button
                                onClick={() => openEditLocalModal(account)}
                                className="rounded-xl p-2.5 bg-blue-500/5 hover:bg-blue-500/10 text-blue-500 transition cursor-pointer"
                                title="Edit local storage"
                              >
                                <i className="fa-solid fa-pen-to-square text-xs"></i>
                              </button>
                            )}
                            <button
                              onClick={() => disconnectAccount(account.id)}
                              className="rounded-xl p-2.5 bg-red-500/5 hover:bg-red-500/10 text-red-500 transition cursor-pointer"
                            >
                              <i className="fa-solid fa-trash-can text-xs"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* S3 Connection Modal */}
      {showS3Modal && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 animate-in fade-in duration-200">
          <div
            ref={s3ModalRef}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] text-xs my-auto"
          >
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Connect Custom S3 Storage</h3>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Directly sync and upload to Amazon S3, MinIO, or Cloudflare R2</p>

            <form onSubmit={handleConnectS3} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Config Name</label>
                  <input
                    type="text"
                    value={s3Form.name}
                    onChange={(e) => setS3Form({ ...s3Form, name: e.target.value })}
                    required
                    placeholder="MinIO Storage"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bucket Name</label>
                  <input
                    type="text"
                    value={s3Form.bucket}
                    onChange={(e) => setS3Form({ ...s3Form, bucket: e.target.value })}
                    required
                    placeholder="my-bucket"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Region</label>
                  <input
                    type="text"
                    value={s3Form.region}
                    onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                    required
                    placeholder="us-east-1"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Endpoint URL (Optional)</label>
                  <input
                    type="url"
                    value={s3Form.endpoint}
                    onChange={(e) => setS3Form({ ...s3Form, endpoint: e.target.value })}
                    placeholder="https://s3.amazonaws.com"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Access Key ID</label>
                  <input
                    type="text"
                    value={s3Form.accessKeyId}
                    onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })}
                    required
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Secret Access Key</label>
                  <input
                    type="password"
                    value={s3Form.secretAccessKey}
                    onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })}
                    required
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Path Prefix (Optional)</label>
                  <input
                    type="text"
                    value={s3Form.prefix}
                    onChange={(e) => setS3Form({ ...s3Form, prefix: e.target.value })}
                    placeholder="clospol"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Quota Limit in Bytes (Optional)</label>
                  <input
                    type="text"
                    value={s3Form.quotaBytes}
                    onChange={(e) => setS3Form({ ...s3Form, quotaBytes: e.target.value })}
                    placeholder="10737418240 (10 GB)"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={s3Form.forcePathStyle}
                  onChange={(e) => setS3Form({ ...s3Form, forcePathStyle: e.target.checked })}
                  className="h-4 w-4 text-blue-600 border-slate-300 dark:border-slate-700 rounded focus:ring-blue-500 bg-white dark:bg-slate-950"
                />
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Force Path Style</label>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowS3Modal(false)}
                  className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={s3Form.loading}
                  className="h-10 px-6 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/10 hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                >
                  {!s3Form.loading ? (
                    <span>Connect Bucket</span>
                  ) : (
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Local Storage Connection Modal */}
      {showLocalModal && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 animate-in fade-in duration-200">
          <div
            ref={localModalRef}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] text-xs my-auto"
          >
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Connect Local Storage</h3>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Configure a local directory on this server for file storage</p>

            <form onSubmit={handleConnectLocal} className="mt-4 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Storage Name</label>
                <input
                  type="text"
                  value={localForm.name}
                  onChange={(e) => setLocalForm({ ...localForm, name: e.target.value })}
                  required
                  placeholder="Local SSD Storage"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-200 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Directory Path</label>
                <input
                  type="text"
                  value={localForm.path}
                  onChange={(e) => setLocalForm({ ...localForm, path: e.target.value })}
                  required
                  placeholder="C:/my_storage (Windows) or /var/my_storage (Linux)"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-200 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">Note: Must be a directory readable and writable by the server process.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Quota Limit in Bytes (Optional)</label>
                <input
                  type="text"
                  value={localForm.quotaBytes}
                  onChange={(e) => setLocalForm({ ...localForm, quotaBytes: e.target.value })}
                  placeholder="5368709120 (5 GB)"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-200 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowLocalModal(false)}
                  className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={localForm.loading}
                  className="h-10 px-6 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/10 hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                >
                  {!localForm.loading ? (
                    <span>Connect Storage</span>
                  ) : (
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Local Storage Modal */}
      {showEditLocalModal && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 animate-in fade-in duration-200">
          <div
            ref={editLocalModalRef}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] text-xs my-auto"
          >
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Edit Local Storage</h3>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Configure directory parameters on this server for file storage</p>

            <form onSubmit={updateLocalConfig} className="mt-4 space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Storage Name</label>
                <input
                  type="text"
                  value={editLocalForm.name}
                  onChange={(e) => setEditLocalForm({ ...editLocalForm, name: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Directory Path</label>
                <input
                  type="text"
                  value={editLocalForm.path}
                  onChange={(e) => setEditLocalForm({ ...editLocalForm, path: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">Note: Must be a directory readable and writable by the server process.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Quota Limit in Bytes (Optional)</label>
                <input
                  type="text"
                  value={editLocalForm.quotaBytes}
                  onChange={(e) => setEditLocalForm({ ...editLocalForm, quotaBytes: e.target.value })}
                  placeholder="5368709120 (5 GB)"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:border-blue-500 transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowEditLocalModal(false)}
                  className="h-10 px-4 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLocalForm.loading}
                  className="h-10 px-6 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-500/10 hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                >
                  {!editLocalForm.loading ? (
                    <span>Save Changes</span>
                  ) : (
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
