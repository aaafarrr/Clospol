"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";

export default function SystemAdminAndProfilePage() {
  const [activeTab, setActiveTab] = useState<"account" | "system" | "advanced" | "maintenance">("account");
  const [loading, setLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // ==========================================
  // 1. ACCOUNT PROFILE STATE & HANDLERS
  // ==========================================
  const [userProfile, setUserProfile] = useState({
    name: "",
    email: "",
    loading: false,
  });
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    new: "",
    confirm: "",
    loading: false,
  });

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserProfile((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: userProfile.name, email: userProfile.email }),
      });
      if (res.ok) {
        setAlertMessage("Profile details updated successfully.");
        loadData();
      } else {
        alert("Failed to update profile.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUserProfile((prev) => ({ ...prev, loading: false }));
    }
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      alert("New password and confirmation do not match.");
      return;
    }
    setPasswordForm((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/auth/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: passwordForm.current, newPassword: passwordForm.new }),
      });
      if (res.ok) {
        setAlertMessage("Password changed successfully.");
        setPasswordForm({ current: "", new: "", confirm: "", loading: false });
      } else {
        const data = await res.json();
        alert(data.error || "Failed to change password.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPasswordForm((prev) => ({ ...prev, loading: false }));
    }
  };

  // ==========================================
  // 2. SYSTEM ADMIN STATE & HANDLERS
  // ==========================================
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [envConfig, setEnvConfig] = useState<any>({});

  const [updateChecked, setUpdateChecked] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [updateStep, setUpdateStep] = useState("");
  const [updateError, setUpdateError] = useState("");

  // ==========================================
  // 3. ADVANCED SETUP STATE & HANDLERS
  // ==========================================
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleRedirectUri, setGoogleRedirectUri] = useState("");
  const [googleScopes, setGoogleScopes] = useState("");
  const [showOAuthHelp, setShowOAuthHelp] = useState(true);

  const [onedriveClientId, setOnedriveClientId] = useState("");
  const [onedriveClientSecret, setOnedriveClientSecret] = useState("");
  const [onedriveRedirectUri, setOnedriveRedirectUri] = useState("");
  const [onedriveScopes, setOnedriveScopes] = useState("");
  const [showOnedriveHelp, setShowOnedriveHelp] = useState(false);

  const [dropboxClientId, setDropboxClientId] = useState("");
  const [dropboxClientSecret, setDropboxClientSecret] = useState("");
  const [dropboxRedirectUri, setDropboxRedirectUri] = useState("");
  const [dropboxScopes, setDropboxScopes] = useState("");
  const [showDropboxHelp, setShowDropboxHelp] = useState(false);
  
  const [maxUploadMb, setMaxUploadMb] = useState(5120); // default 5GB in MB
  const [appUrl, setAppUrl] = useState("");
  const [googleDriveRootFolder, setGoogleDriveRootFolder] = useState("clospol");
  const [onedrivePrefix, setOnedrivePrefix] = useState("clospol");
  const [dropboxPrefix, setDropboxPrefix] = useState("clospol");
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState("");
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState("");
  const [savingAdvanced, setSavingAdvanced] = useState(false);

  // ==========================================
  // 4. MAINTENANCE & CACHE CLEANUP STATE & HANDLERS
  // ==========================================
  const [cacheStats, setCacheStats] = useState({
    cctv: { sizeFormatted: "0 B", filesCount: 0 },
    next: { sizeFormatted: "0 B", filesCount: 0 },
    dbLogs: { auditLogsCount: 0, uploadSessionsCount: 0, totalCount: 0 },
    total: { sizeFormatted: "0 B", filesCount: 0 },
  });
  const [cleaningCache, setCleaningCache] = useState(false);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const loadCacheStats = async () => {
    try {
      const res = await fetch("/api/settings/cache");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setCacheStats({
            cctv: {
              sizeFormatted: formatBytes(data.stats.cctv.sizeBytes),
              filesCount: data.stats.cctv.filesCount,
            },
            next: {
              sizeFormatted: formatBytes(data.stats.next.sizeBytes),
              filesCount: data.stats.next.filesCount,
            },
            dbLogs: {
              auditLogsCount: data.stats.dbLogs.auditLogsCount,
              uploadSessionsCount: data.stats.dbLogs.uploadSessionsCount,
              totalCount: data.stats.dbLogs.totalCount,
            },
            total: {
              sizeFormatted: formatBytes(data.stats.total.sizeBytes),
              filesCount: data.stats.total.filesCount,
            },
          });
        }
      }
    } catch (err) {
      console.error("Failed to load cache stats:", err);
    }
  };

  const handleCleanCache = async () => {
    setCleaningCache(true);
    setAlertMessage(null);
    try {
      const res = await fetch("/api/settings/cache", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const freed = formatBytes(data.result.bytesFreed);
          setAlertMessage(`Purged ${data.result.filesDeleted} files and ${data.result.logsDeleted} database log entries successfully (${freed} freed).`);
          await loadCacheStats();
        } else {
          alert(data.error || "Failed to clear cache.");
        }
      } else {
        alert("Server returned error response while clearing cache.");
      }
    } catch (err) {
      console.error("Failed to clear cache:", err);
    } finally {
      setCleaningCache(false);
    }
  };

  const loadData = async () => {
    try {
      await loadCacheStats();
      // Load user profile
      const userRes = await fetch("/api/auth/me");
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.user) {
          setUserProfile({
            name: userData.user.name,
            email: userData.user.email,
            loading: false,
          });
        }
      }

      // Load environment configuration
      const envRes = await fetch("/api/settings/env");
      if (envRes.ok) {
        const env = (await envRes.json()).env || {};
        setEnvConfig(env);
        if (env.TZ) setTimezone(env.TZ);
        if (env.APP_VERSION) setAppVersion(env.APP_VERSION);

        // Populate advanced parameters
        setGoogleClientId(env.GOOGLE_CLIENT_ID || "");
        setGoogleClientSecret(env.GOOGLE_CLIENT_SECRET || "");
        setGoogleRedirectUri(env.GOOGLE_REDIRECT_URI || `${window.location.origin}/api/oauth/google/callback`);
        setGoogleScopes(env.GOOGLE_SCOPES || "https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile");

        setOnedriveClientId(env.ONEDRIVE_CLIENT_ID || "");
        setOnedriveClientSecret(env.ONEDRIVE_CLIENT_SECRET || "");
        setOnedriveRedirectUri(env.ONEDRIVE_REDIRECT_URI || `${window.location.origin}/api/oauth/onedrive/callback`);
        setOnedriveScopes(env.ONEDRIVE_SCOPES || "offline_access Files.ReadWrite User.Read");

        setDropboxClientId(env.DROPBOX_CLIENT_ID || "");
        setDropboxClientSecret(env.DROPBOX_CLIENT_SECRET || "");
        setDropboxRedirectUri(env.DROPBOX_REDIRECT_URI || `${window.location.origin}/api/oauth/dropbox/callback`);
        setDropboxScopes(env.DROPBOX_SCOPES || "files.metadata.read files.content.write files.content.read");
        
        const bytes = parseInt(env.MAX_UPLOAD_BYTES || "5368709120");
        setMaxUploadMb(Math.round(bytes / (1024 * 1024)));
        
        setAppUrl(env.NEXT_PUBLIC_APP_URL || `${window.location.origin}`);
        setGoogleDriveRootFolder(env.GOOGLE_DRIVE_ROOT_FOLDER || "clospol");
        setOnedrivePrefix(env.ONEDRIVE_PREFIX || "clospol");
        setDropboxPrefix(env.DROPBOX_PREFIX || "clospol");
        
        setRecaptchaSiteKey(env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "");
        setRecaptchaSecretKey(env.RECAPTCHA_SECRET_KEY || "");
      }
    } catch (err) {
      console.error("Failed to load settings data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "advanced" || tab === "system" || tab === "account" || tab === "maintenance") {
        setActiveTab(tab);
      }
    }
  }, []);

  const saveTimezoneConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTimezone(true);
    try {
      const updatedEnv = {
        ...envConfig,
        TZ: timezone,
      };
      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env: updatedEnv }),
      });
      if (res.ok) {
        setAlertMessage("System timezone (TZ) configuration updated successfully.");
        loadData();
      } else {
        alert("Failed to update timezone configuration.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTimezone(false);
    }
  };

  const saveSystemConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAdvanced(true);
    try {
      const updatedEnv = {
        ...envConfig,
        NEXT_PUBLIC_APP_URL: appUrl,
        MAX_UPLOAD_BYTES: String(maxUploadMb * 1024 * 1024),
        NEXT_PUBLIC_RECAPTCHA_SITE_KEY: recaptchaSiteKey,
        RECAPTCHA_SECRET_KEY: recaptchaSecretKey,
      };

      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env: updatedEnv }),
      });
      if (res.ok) {
        setAlertMessage("System configurations saved successfully.");
        loadData();
      } else {
        alert("Failed to update system configurations.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAdvanced(false);
    }
  };

  const saveOAuthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAdvanced(true);
    try {
      const updatedEnv = {
        ...envConfig,
        GOOGLE_CLIENT_ID: googleClientId,
        GOOGLE_CLIENT_SECRET: googleClientSecret,
        GOOGLE_REDIRECT_URI: googleRedirectUri,
        GOOGLE_SCOPES: googleScopes,
        GOOGLE_DRIVE_ROOT_FOLDER: googleDriveRootFolder,
        ONEDRIVE_CLIENT_ID: onedriveClientId,
        ONEDRIVE_CLIENT_SECRET: onedriveClientSecret,
        ONEDRIVE_REDIRECT_URI: onedriveRedirectUri,
        ONEDRIVE_SCOPES: onedriveScopes,
        ONEDRIVE_PREFIX: onedrivePrefix,
        DROPBOX_CLIENT_ID: dropboxClientId,
        DROPBOX_CLIENT_SECRET: dropboxClientSecret,
        DROPBOX_REDIRECT_URI: dropboxRedirectUri,
        DROPBOX_SCOPES: dropboxScopes,
        DROPBOX_PREFIX: dropboxPrefix,
      };

      const res = await fetch("/api/settings/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env: updatedEnv }),
      });
      if (res.ok) {
        setAlertMessage("Cloud storage provider OAuth configurations saved successfully.");
        loadData();
      } else {
        alert("Failed to update OAuth credentials.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAdvanced(false);
    }
  };

  const checkForUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError("");
    try {
      const res = await fetch("/api/settings/update/check");
      const data = await res.json();
      if (res.ok) {
        setUpdateChecked(true);
        setUpdateAvailable(data.update_available);
        setLatestVersion(data.latest_version || "");
        setReleaseNotes(data.release_notes || "");
      } else {
        setUpdateError(data.message || "Failed to check release status.");
      }
    } catch (err: any) {
      setUpdateError(err.message || "Update request failed.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const installUpdate = async () => {
    if (!confirm(`Update system to ${latestVersion} now? This will download release assets, sync files, and apply migrations.`)) return;
    setUpdatingApp(true);
    setUpdateStep("Initiating update install procedure...");
    setUpdateError("");

    try {
      const res = await fetch("/api/settings/update/install", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setUpdateStep("System update applied successfully. Reloading platform...");
        setTimeout(() => {
          window.location.reload();
        }, 2500);
      } else {
        setUpdateError(data.message || "Update install script failed.");
        setUpdatingApp(false);
      }
    } catch (err: any) {
      setUpdateError(err.message || "Procedure interrupted.");
      setUpdatingApp(false);
    }
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <i className="fa-solid fa-gears text-blue-500"></i> Settings
          </h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Manage your personal profile, credentials, timezone configuration, upload boundaries, and system upgrades.
          </p>
        </div>

        {/* Alert Banner */}
        {alertMessage && (
          <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-700 dark:text-blue-400 font-bold animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <i className="fa-solid fa-circle-info text-blue-500 shrink-0"></i>
              <span className="truncate">{alertMessage}</span>
            </div>
            <button onClick={() => setAlertMessage(null)} className="text-blue-400 hover:text-blue-600 transition shrink-0 cursor-pointer">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex overflow-x-auto no-scrollbar space-x-1 p-1 bg-slate-100 dark:bg-slate-955 rounded-2xl max-w-2xl border border-slate-200/40 dark:border-slate-800/80 animate-in fade-in duration-200">
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`flex-shrink-0 flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "account"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-450 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <i className="fa-solid fa-user"></i>
            <span>Profile</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`flex-shrink-0 flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "system"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-450 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <i className="fa-solid fa-sliders"></i>
            <span>System Config</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("advanced")}
            className={`flex-shrink-0 flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "advanced"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-450 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <i className="fa-solid fa-key"></i>
            <span>Storage OAuth</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("maintenance")}
            className={`flex-shrink-0 flex-1 py-2 px-3 rounded-xl text-xs font-black transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "maintenance"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-450 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <i className="fa-solid fa-screwdriver-wrench"></i>
            <span>Maintenance</span>
          </button>
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
          <div>
            {/* ============================================================== */}
            {/* TAB A: ACCOUNT PROFILE */}
            {/* ============================================================== */}
            {activeTab === "account" && (
              <div className="grid gap-6 md:grid-cols-2 w-full items-start animate-in fade-in duration-200">
                {/* User Profile Card */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5 min-w-0">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <i className="fa-solid fa-user text-blue-500"></i> User Profile
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                      Update your account details and view access metrics
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-150 dark:border-slate-800 space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                    <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
                      Profile Boundaries:
                    </span>
                    <p>Your user profile name is displayed in activity audits and shared folder links. Email addresses are fixed and represent your primary workspace identity identifier.</p>
                  </div>

                  <form onSubmit={updateProfile} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Name</label>
                      <input
                        type="text"
                        value={userProfile.name}
                        onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Email <span className="font-normal text-slate-400 dark:text-slate-500">(Primary Identifier)</span>
                      </label>
                      <div className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-2 cursor-not-allowed select-none">
                        <i className="fa-solid fa-lock text-xs"></i>
                        <span>{userProfile.email}</span>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={userProfile.loading}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                    >
                      {!userProfile.loading ? (
                        <span>Update Profile</span>
                      ) : (
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      )}
                    </button>
                  </form>
                </div>

                {/* Change Password Card */}
                <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5 min-w-0">
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <i className="fa-solid fa-key text-blue-500"></i> Change Password
                    </h2>
                    <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                      Set a new password for your account authentication
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-150 dark:border-slate-800 space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                    <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
                      Password Requirements:
                    </span>
                    <p>Choose a unique, complex passphrase. Changing your password immediately terminates other active web sessions and WebDAV connections to prevent unauthorized access.</p>
                  </div>

                  <form onSubmit={updatePassword} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Current Password</label>
                      <input
                        type="password"
                        value={passwordForm.current}
                        onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">New Password</label>
                      <input
                        type="password"
                        value={passwordForm.new}
                        onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Confirm New Password</label>
                      <input
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={passwordForm.loading}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                    >
                      {!passwordForm.loading ? (
                        <span>Change Password</span>
                      ) : (
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB B: SYSTEM CONFIGURATION */}
            {/* ============================================================== */}
            {activeTab === "system" && (
              <div className="space-y-8 animate-in fade-in duration-200">
                {/* Timezone & Updates Grid */}
                <div className="grid gap-6 md:grid-cols-2 w-full items-start">
                  {/* Timezone Settings Section */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i className="fa-solid fa-clock text-blue-500"></i> Timezone Configuration
                      </h2>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Configure default timezone for scheduler and cron operations.</p>
                    </div>

                    <form onSubmit={saveTimezoneConfig} className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="timezone" className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">System Timezone</label>
                        <select
                          id="timezone"
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          className="w-full h-11 border border-slate-250 dark:border-slate-800 rounded-xl px-4 text-xs font-bold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-205 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                        >
                          <option value="UTC">Coordinated Universal Time (UTC)</option>
                          <option value="Asia/Jakarta">Asia/Jakarta (WIB - UTC+7)</option>
                          <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+8)</option>
                          <option value="America/New_York">America/New_York (EST/EDT - UTC-5/UTC-4)</option>
                          <option value="Europe/London">Europe/London (GMT/BST - UTC+0/UTC+1)</option>
                          <option value="Europe/Paris">Europe/Paris (CET/CEST - UTC+1/UTC+2)</option>
                          <option value="Asia/Tokyo">Asia/Tokyo (JST - UTC+9)</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={savingTimezone}
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                      >
                        {savingTimezone ? (
                          <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                        ) : (
                          <span>Save Timezone</span>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* System Updates Section */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i className="fa-solid fa-circle-up text-blue-500 mr-1.5"></i> System Updates
                      </h2>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Check and apply updates for your Clospol installation.</p>
                    </div>

                    <div className="space-y-4 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl bg-slate-50/20 dark:bg-slate-955/20 text-xs">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-500 dark:text-slate-400">Current Version:</span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[10px] font-black border border-slate-200/50 dark:border-slate-700">
                          {appVersion}
                        </span>
                      </div>

                      {/* Error State */}
                      {updateError && (
                        <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-between gap-2.5 text-xs text-red-700 dark:text-red-400 font-bold animate-in slide-in-from-top-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <i className="fa-solid fa-triangle-exclamation text-red-500 shrink-0"></i>
                            <span className="truncate">{updateError}</span>
                          </div>
                          <button onClick={() => setUpdateError("")} className="text-red-455 hover:text-red-655 transition shrink-0 cursor-pointer">
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </div>
                      )}

                      {/* Default / Check Button */}
                      {!updateChecked && !checkingUpdate && !updatingApp && (
                        <button
                          onClick={checkForUpdate}
                          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <i className="fa-solid fa-arrows-rotate"></i> Check for Updates
                        </button>
                      )}

                      {/* Checking State */}
                      {checkingUpdate && (
                        <div className="flex items-center justify-center py-2 text-xs text-slate-500 dark:text-slate-400 font-bold gap-2">
                          <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></span>
                          Checking GitHub for latest release...
                        </div>
                      )}

                      {/* Checked & Up to date */}
                      {updateChecked && !updateAvailable && !checkingUpdate && !updatingApp && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div className="p-3 bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 rounded-xl flex items-center gap-2.5 text-xs text-green-700 dark:text-green-400 font-bold">
                            <i className="fa-solid fa-circle-check text-sm text-green-500"></i>
                            Your application is up to date!
                          </div>
                          <button
                            onClick={checkForUpdate}
                            className="w-full h-10 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-805 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-xs transition cursor-pointer"
                          >
                            Check Again
                          </button>
                        </div>
                      )}

                      {/* Update Available */}
                      {updateChecked && updateAvailable && !checkingUpdate && !updatingApp && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                          <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 font-bold">
                              <i className="fa-solid fa-circle-info text-sm text-blue-500"></i>
                              <span>New Update Available: <span className="font-mono text-blue-600 dark:text-blue-300">{latestVersion}</span></span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold max-h-40 overflow-y-auto leading-relaxed border-t border-slate-200/40 dark:border-slate-800 pt-2 whitespace-pre-line">
                              {releaseNotes}
                            </div>
                          </div>
                          <button
                            onClick={installUpdate}
                            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-md shadow-green-500/10 transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <i className="fa-solid fa-circle-down"></i> Update to {latestVersion}
                          </button>
                        </div>
                      )}

                      {/* Updating state */}
                      {updatingApp && (
                        <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                          <span className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mx-auto block mb-2"></span>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{updateStep}</p>
                          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-normal">
                            Please do not refresh, close this page, or navigate away. Your database and files are being safely updated.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200/60 dark:border-slate-800/80 my-2"></div>

                <form onSubmit={saveSystemConfig} className="grid gap-6 md:grid-cols-2 w-full items-start">
                  {/* Storage & Limits Config */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i className="fa-solid fa-hard-drive text-blue-500"></i> Storage & Limits Setup
                      </h2>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                        Configure constraints and directories used for data uploads.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Base App URL</label>
                      <input
                        type="url"
                        value={appUrl}
                        onChange={(e) => setAppUrl(e.target.value)}
                        required
                        placeholder="e.g. http://localhost:3000"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                        This base URL is used for OAuth redirects, media streams, and webhook routing.
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Max Upload Limit (MB)</label>
                      <input
                        type="number"
                        value={maxUploadMb}
                        onChange={(e) => setMaxUploadMb(Number(e.target.value))}
                        required
                        min={10}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-955 text-slate-800 dark:text-slate-100 outline-none"
                      />
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                        Current maximum upload file size limit: {(maxUploadMb / 1024).toFixed(2)} GB
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={savingAdvanced}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                    >
                      {savingAdvanced ? (
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      ) : (
                        <span>Save System Parameters</span>
                      )}
                    </button>
                  </div>

                  {/* Anti-Bot Security Config */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i className="fa-solid fa-shield-halved text-blue-500"></i> Anti-Bot Security
                      </h2>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                        Configure Google reCAPTCHA constraints for login pages.
                      </p>
                    </div>

                    <div className="grid gap-4 grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">reCAPTCHA Site Key</label>
                        <input
                          type="text"
                          value={recaptchaSiteKey}
                          onChange={(e) => setRecaptchaSiteKey(e.target.value)}
                          placeholder="Public site key"
                          className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold transition bg-white dark:bg-slate-955 text-slate-800 dark:text-slate-100 outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">reCAPTCHA Secret Key</label>
                        <input
                          type="password"
                          value={recaptchaSecretKey}
                          onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                          placeholder="Secret server key"
                          className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold transition bg-white dark:bg-slate-955 text-slate-800 dark:text-slate-100 outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingAdvanced}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                    >
                      {savingAdvanced ? (
                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                      ) : (
                        <span>Save Security Parameters</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB C: OAUTH STORAGE CONFIGURATIONS */}
            {/* ============================================================== */}
            {activeTab === "advanced" && (
              <div className="space-y-8 animate-in fade-in duration-200">
                <form onSubmit={saveOAuthConfig} className="grid gap-6 md:grid-cols-2 w-full items-start">
                  {/* Google OAuth Setup */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <i className="fa-brands fa-google text-blue-500"></i> Google OAuth Setup
                        </h2>
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                          Rotate client credentials used for Google Drive authorization.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOAuthHelp(!showOAuthHelp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-805 text-[10px] font-black text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-circle-question"></i>
                        Setup Guide
                      </button>
                    </div>

                    {showOAuthHelp && (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed space-y-2 font-semibold">
                        <div className="font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1">
                          <i className="fa-solid fa-gear text-blue-500"></i>
                          How to get Google Drive credentials:
                        </div>
                        <ol className="list-decimal pl-4 space-y-1.5">
                          <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google Cloud Console</a> and create/select a project.</li>
                          <li>Go to **APIs & Services** &gt; **Library**, search for **Google Drive API**, select it, and click **Enable**.</li>
                          <li>Go to the **OAuth consent screen** tab, set type to **External**, enter your email, configure scope endpoints (`drive`, `userinfo.email`), and register your login email under **Test Users**.</li>
                          <li><span className="text-blue-500 dark:text-blue-400 font-bold">Publish your App (Critical)</span>: Still on the **OAuth consent screen** tab under **Publishing status**, click the **Publish App** button to switch it from <em>Testing</em> to <em>In Production</em>. If left in <em>Testing</em>, Google will automatically expire user access authorizations after 7 days, forcing you to re-link accounts weekly.</li>
                          <li>Go to **Credentials** &gt; **Create Credentials** &gt; **OAuth client ID** &gt; choose **Web application** type.</li>
                          <li>Under **Authorized JavaScript origins**, click **Add URI** and enter your main website origin address (e.g. <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}</code>).</li>
                          <li>Under **Authorized Redirect URIs**, click **Add URI** and enter the redirect URI below:
                            <code className="block mt-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[10px] select-all text-blue-500 dark:text-blue-400 font-bold">
                              {googleRedirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/api/oauth/google/callback` : 'http://localhost:3000/api/oauth/google/callback')}
                            </code>
                          </li>
                          <li>Copy the generated **Client ID** and **Client Secret** and fill them in below.</li>
                        </ol>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Google Client ID</label>
                      <input
                        type="text"
                        value={googleClientId}
                        onChange={(e) => setGoogleClientId(e.target.value)}
                        placeholder="Paste Google Drive Client ID string"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Google Client Secret</label>
                      <input
                        type="password"
                        value={googleClientSecret}
                        onChange={(e) => setGoogleClientSecret(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Google Redirect URI</label>
                      <input
                        type="text"
                        value={googleRedirectUri}
                        onChange={(e) => setGoogleRedirectUri(e.target.value)}
                        placeholder="e.g. http://localhost:3000/api/oauth/google/callback"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Google Scopes (Comma separated)</label>
                        <button
                          type="button"
                          onClick={() => setGoogleScopes("https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile")}
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-[10px] font-black transition flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i> Reset default
                        </button>
                      </div>
                      <input
                        type="text"
                        value={googleScopes}
                        onChange={(e) => setGoogleScopes(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-350">Google Drive Global Root Folder Name</label>
                      <input
                        type="text"
                        value={googleDriveRootFolder}
                        onChange={(e) => setGoogleDriveRootFolder(e.target.value)}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                  </div>

                  {/* OneDrive OAuth Setup */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <i className="fa-brands fa-microsoft text-blue-500"></i> OneDrive OAuth Setup
                        </h2>
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                          Rotate client credentials used for Microsoft OneDrive authorization.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOnedriveHelp(!showOnedriveHelp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-805 text-[10px] font-black text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-circle-question"></i>
                        Setup Guide
                      </button>
                    </div>

                    {showOnedriveHelp && (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed space-y-2 font-semibold">
                        <div className="font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1">
                          <i className="fa-solid fa-gear text-blue-500"></i>
                          How to get OneDrive credentials:
                        </div>
                        <ol className="list-decimal pl-4 space-y-1.5">
                          <li>Go to the <a href="https://portal.azure.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Azure Portal</a> and select **Microsoft Entra ID** (Active Directory).</li>
                          <li>Go to **App registrations** &gt; **New registration**. Enter name and select **Accounts in any organizational directory and personal Microsoft accounts** (Multitenant).</li>
                          <li>Set the Web Redirect URI to:
                            <code className="block mt-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[10px] select-all text-blue-500 dark:text-blue-400 font-bold">
                              {onedriveRedirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/api/oauth/onedrive/callback` : 'http://localhost:3000/api/oauth/onedrive/callback')}
                            </code>
                          </li>
                          <li>Under **Certificates & secrets**, create a new **Client secret**. Copy its **Value** immediately.</li>
                          <li>Under **API permissions**, add **Microsoft Graph** delegated permissions: `Files.ReadWrite` and `offline_access`.</li>
                          <li>Copy the **Application (client) ID** and fill them in below.</li>
                        </ol>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">OneDrive Client ID</label>
                      <input
                        type="text"
                        value={onedriveClientId}
                        onChange={(e) => setOnedriveClientId(e.target.value)}
                        placeholder="Paste Microsoft Application Client ID string"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">OneDrive Client Secret</label>
                      <input
                        type="password"
                        value={onedriveClientSecret}
                        onChange={(e) => setOnedriveClientSecret(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">OneDrive Redirect URI</label>
                      <input
                        type="text"
                        value={onedriveRedirectUri}
                        onChange={(e) => setOnedriveRedirectUri(e.target.value)}
                        placeholder="e.g. http://localhost:3000/api/oauth/onedrive/callback"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">OneDrive Scopes (Space separated)</label>
                        <button
                          type="button"
                          onClick={() => setOnedriveScopes("offline_access Files.ReadWrite User.Read")}
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-[10px] font-black transition flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i> Reset default
                        </button>
                      </div>
                      <input
                        type="text"
                        value={onedriveScopes}
                        onChange={(e) => setOnedriveScopes(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">OneDrive Storage Path Prefix</label>
                      <input
                        type="text"
                        value={onedrivePrefix}
                        onChange={(e) => setOnedrivePrefix(e.target.value)}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                  </div>

                  {/* Dropbox OAuth Setup */}
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                          <i className="fa-brands fa-dropbox text-blue-500"></i> Dropbox OAuth Setup
                        </h2>
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                          Rotate client credentials used for Dropbox authorization.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDropboxHelp(!showDropboxHelp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-805 text-[10px] font-black text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        <i className="fa-solid fa-circle-question"></i>
                        Setup Guide
                      </button>
                    </div>

                    {showDropboxHelp && (
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed space-y-2">
                        <div className="font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1">
                          <i className="fa-solid fa-gear text-blue-500"></i>
                          How to get Dropbox credentials:
                        </div>
                        <ol className="list-decimal pl-4 space-y-1.5 font-semibold">
                          <li>Go to the <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Dropbox App Console</a>.</li>
                          <li>Click **Create App**, select **Scoped access**, choose **Full Dropbox** or **App folder** type.</li>
                          <li>In the **Settings** tab, configure the Redirect URI to:
                            <code className="block mt-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[10px] select-all text-blue-500 dark:text-blue-400 font-bold">
                              {dropboxRedirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/api/oauth/dropbox/callback` : 'http://localhost:3000/api/oauth/dropbox/callback')}
                            </code>
                          </li>
                          <li>In the **Permissions** tab, enable scopes: `files.metadata.read`, `files.content.write`, `files.content.read`. Click **Submit**.</li>
                          <li>Copy the **App key** (Client ID) and **App secret** (Client Secret) and fill them in below.</li>
                        </ol>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dropbox App Key (Client ID)</label>
                      <input
                        type="text"
                        value={dropboxClientId}
                        onChange={(e) => setDropboxClientId(e.target.value)}
                        placeholder="Paste Dropbox App Key"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dropbox App Secret (Client Secret)</label>
                      <input
                        type="password"
                        value={dropboxClientSecret}
                        onChange={(e) => setDropboxClientSecret(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dropbox Redirect URI</label>
                      <input
                        type="text"
                        value={dropboxRedirectUri}
                        onChange={(e) => setDropboxRedirectUri(e.target.value)}
                        placeholder="e.g. http://localhost:3000/api/oauth/dropbox/callback"
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dropbox Scopes (Space separated)</label>
                        <button
                          type="button"
                          onClick={() => setDropboxScopes("files.metadata.read files.content.write files.content.read")}
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-[10px] font-black transition flex items-center gap-1 cursor-pointer"
                        >
                          <i className="fa-solid fa-rotate-left text-[9px]"></i> Reset default
                        </button>
                      </div>
                      <input
                        type="text"
                        value={dropboxScopes}
                        onChange={(e) => setDropboxScopes(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dropbox Storage Path Prefix</label>
                      <input
                        type="text"
                        value={dropboxPrefix}
                        onChange={(e) => setDropboxPrefix(e.target.value)}
                        required
                        className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                  </div>

                  {/* General Save Button */}
                  <div className="col-span-full pt-4">
                    <button
                      type="submit"
                      disabled={savingAdvanced}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-750 text-white rounded-2xl font-bold text-sm shadow-md transition flex items-center justify-center cursor-pointer"
                    >
                      {savingAdvanced ? (
                        <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
                      ) : (
                        <span>Save OAuth Configurations</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Maintenance & Cache Purge Section */}
            {activeTab === "maintenance" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-screwdriver-wrench text-blue-500"></i> System Maintenance
                  </h3>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Perform system housekeeping tasks and clean temporary files.
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 w-full items-start">
                  <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-4 min-w-0">
                    <div>
                      <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <i className="fa-solid fa-broom text-blue-500"></i> Cache & Logs Purging
                      </h2>
                      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                        Purge temporary HLS CCTV stream fragments, Next.js caches, and database logs to free storage.
                      </p>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold">
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-400 dark:text-slate-500">CCTV Stream Cache</span>
                        <span className="font-bold text-slate-700 dark:text-slate-350">
                          {cacheStats.cctv.sizeFormatted} ({cacheStats.cctv.filesCount} files)
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-400 dark:text-slate-500">Next.js System Cache</span>
                        <span className="font-bold text-slate-700 dark:text-slate-350">
                          {cacheStats.next.sizeFormatted} ({cacheStats.next.filesCount} files)
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-400 dark:text-slate-500">Database Audit Logs</span>
                        <span className="font-bold text-slate-700 dark:text-slate-350">
                          {cacheStats.dbLogs.auditLogsCount} records
                        </span>
                      </div>
                      <div className="py-2.5 flex justify-between">
                        <span className="text-slate-400 dark:text-slate-500">Upload History Logs</span>
                        <span className="font-bold text-slate-700 dark:text-slate-350">
                          {cacheStats.dbLogs.uploadSessionsCount} records
                        </span>
                      </div>
                      <div className="py-3 flex justify-between border-t border-slate-200 dark:border-slate-800">
                        <span className="text-slate-850 dark:text-slate-200 font-extrabold">Total Cache & Log Space</span>
                        <span className="font-black text-blue-600 dark:text-blue-400">
                          {cacheStats.total.sizeFormatted} (+{cacheStats.dbLogs.totalCount} logs)
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={cleaningCache || (cacheStats.total.filesCount === 0 && cacheStats.dbLogs.totalCount === 0)}
                      onClick={handleCleanCache}
                      className="w-full h-11 bg-red-600 hover:bg-red-750 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded-xl font-bold text-sm shadow-md shadow-red-500/10 disabled:shadow-none transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {cleaningCache ? (
                        <>
                          <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                          <span>Cleaning Cache & Logs...</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-trash-can text-sm"></i>
                          <span>Purge Cache & Logs</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
