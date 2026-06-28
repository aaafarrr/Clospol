"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  HardDrive, 
  User, 
  Mail, 
  Lock, 
  Settings, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  HelpCircle,
  Folder,
  Database,
  Globe
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export default function InstallPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(1);
  
  // Step 1: Account state
  const [name, setName] = useState("Administrator");
  const [email, setEmail] = useState("admin@clospol.local");
  const [password, setPassword] = useState("");

  // Step 2: System Config state
  const [appUrl, setAppUrl] = useState("http://localhost:3000");
  const [maxUploadGb, setMaxUploadGb] = useState("5");
  const [rootFolder, setRootFolder] = useState("clospol");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  
  // Step 3: Google OAuth state
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleRedirectUri, setGoogleRedirectUri] = useState("http://localhost:3000/api/oauth/google/callback");
  const [showOAuthHelp, setShowOAuthHelp] = useState(true);

  // Step 2: Feature flags state
  const [featureCctv, setFeatureCctv] = useState(true);
  const [featureWebdav, setFeatureWebdav] = useState(true);
  const [featureIntegrations, setFeatureIntegrations] = useState(true);
  const [featureBackups, setFeatureBackups] = useState(true);

  // Step 4: Local drive config state
  const [localName, setLocalName] = useState("Local Storage");
  const [localPath, setLocalPath] = useState("./storage/local");
  const [localQuotaGb, setLocalQuotaGb] = useState("50");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check status
    fetch("/api/install/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.installed) {
          router.push("/login");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    setGoogleRedirectUri(`${appUrl}/api/oauth/google/callback`);
  }, [appUrl]);

  const validateStep1 = () => {
    if (!name.trim()) {
      setError("Administrator name is required.");
      return false;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Please provide a valid email address.");
      return false;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (validateStep1()) {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setError(null);
      setStep(step - 1);
    }
  };

  const handleInstall = async (e: React.FormEvent, skipGoogle = false, skipLocal = false) => {
    if (e) e.preventDefault();
    
    // Ensure step 1 validates first
    if (!validateStep1()) {
      setStep(1);
      return;
    }

    setLoading(true);
    setError(null);

    // Calculate bytes
    const maxUploadBytesVal = (parseFloat(maxUploadGb) || 5) * 1024 * 1024 * 1024;
    const quotaBytesVal = (parseFloat(localQuotaGb) || 50) * 1024 * 1024 * 1024;

    const payload = {
      name,
      email,
      password,
      env: {
        NEXT_PUBLIC_APP_URL: appUrl,
        MAX_UPLOAD_BYTES: maxUploadBytesVal.toString(),
        S3_PREFIX: rootFolder,
        GOOGLE_DRIVE_ROOT_FOLDER: rootFolder,
        GOOGLE_CLIENT_ID: skipGoogle ? "" : googleClientId,
        GOOGLE_CLIENT_SECRET: skipGoogle ? "" : googleClientSecret,
        GOOGLE_REDIRECT_URI: skipGoogle ? "" : googleRedirectUri,
        TZ: timezone,
        NEXT_PUBLIC_FEATURE_CCTV: featureCctv ? "true" : "false",
        NEXT_PUBLIC_FEATURE_WEBDAV: featureWebdav ? "true" : "false",
        NEXT_PUBLIC_FEATURE_INTEGRATIONS: featureIntegrations ? "true" : "false",
        NEXT_PUBLIC_FEATURE_BACKUPS: featureBackups ? "true" : "false",
      },
      localStorage: skipLocal ? null : {
        name: localName.trim() || "Local Storage",
        serverPath: localPath.trim() || "./storage/local",
        quotaBytes: quotaBytesVal.toString(),
      }
    };

    try {
      const response = await fetch("/api/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to complete setup.");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/all-files");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-500 dark:text-slate-400">
        <div className="animate-pulse text-xs font-semibold">Checking system state...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center select-none relative">
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>
      <div className="max-w-4xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/20 dark:shadow-2xl relative">
        
        {/* Left column: Step Tracker */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 pb-6 lg:pb-0 lg:pr-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <HardDrive size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-300">
                  Clospol
                </h1>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Setup Wizard</p>
              </div>
            </div>

            {/* Stepper Progress */}
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === 1 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105" 
                    : step > 1 
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30" 
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                }`}>
                  {step > 1 ? <CheckCircle size={14} /> : "1"}
                </div>
                <div>
                  <p className={`text-xs font-bold ${step === 1 ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>Admin Credentials</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Account creation</p>
                </div>
              </div>

              {/* Connector line 1 */}
              <div className="w-0.5 h-6 bg-slate-200 dark:bg-slate-800 ml-4"></div>

              {/* Step 2 */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === 2 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105" 
                    : step > 2 
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30" 
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                }`}>
                  {step > 2 ? <CheckCircle size={14} /> : "2"}
                </div>
                <div>
                  <p className={`text-xs font-bold ${step === 2 ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>System Config</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Base URL & limits</p>
                </div>
              </div>

              {/* Connector line 2 */}
              <div className="w-0.5 h-6 bg-slate-200 dark:bg-slate-800 ml-4"></div>

              {/* Step 3 */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === 3 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105" 
                    : step > 3 
                      ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30" 
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                }`}>
                  {step > 3 ? <CheckCircle size={14} /> : "3"}
                </div>
                <div>
                  <p className={`text-xs font-bold ${step === 3 ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>Google OAuth Client</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Drive link (Optional)</p>
                </div>
              </div>

              {/* Connector line 3 */}
              <div className="w-0.5 h-6 bg-slate-200 dark:bg-slate-800 ml-4"></div>

              {/* Step 4 */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  step === 4 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105" 
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                }`}>
                  {step === 4 ? "4" : "4"}
                </div>
                <div>
                  <p className={`text-xs font-bold ${step === 4 ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>Local Server Mount</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Disk config (Optional)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block pt-6 border-t border-slate-200 dark:border-slate-800 mt-6 text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-normal">
            Clospol connects your servers to cloud drives, encrypting and routing your files dynamically under a single administrative gateway.
          </div>
        </div>

        {/* Right column: Dynamic Form step rendering */}
        <div className="lg:col-span-8 flex flex-col justify-between">
          
          <div className="space-y-6">
            {error && (
              <div className="flex gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold leading-relaxed items-center">
                <AlertCircle size={18} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold leading-relaxed items-center">
                <CheckCircle size={18} className="flex-shrink-0" />
                <span>Onboarding successful! Setting up your workspace...</span>
              </div>
            )}

            {/* STEP 1: ADMIN ACCOUNT */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <User className="text-blue-500" size={20} />
                    Create Administrator Account
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                    Set up credentials to manage your Clospol workspace.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Admin Full Name</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                        placeholder="Administrator"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Admin Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                        placeholder="admin@clospol.local"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                        placeholder="•••••••• (Min 8 characters)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: SYSTEM SETTINGS */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Settings className="text-blue-500" size={20} />
                    General System Settings
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                    Configure the main website URL address and storage thresholds for your server.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Application Base URL</label>
                    <input
                      type="url"
                      required
                      value={appUrl}
                      onChange={(e) => setAppUrl(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                      placeholder="http://localhost:3000"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-relaxed">
                      The primary URL of your Clospol website (e.g., <code>http://localhost:3000</code>). Google Cloud Console requires this to ensure authorization requests (OAuth login flows) run securely and are not blocked.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Maximum Upload Size Limit (GB)</label>
                    <input
                      type="number"
                      required
                      value={maxUploadGb}
                      onChange={(e) => setMaxUploadGb(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                      placeholder="5"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-relaxed">
                      The maximum file size limit (in Gigabytes) allowed to be uploaded in a single transaction through the gateway interface. Default is 5 GB.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">App Root Folder</label>
                    <input
                      type="text"
                      required
                      value={rootFolder}
                      onChange={(e) => setRootFolder(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                      placeholder="clospol"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-relaxed">
                      The name of the master root folder automatically created in both Google Drive and your S3 Buckets to organize all Clospol files.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">System Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                    >
                      <option value="Asia/Jakarta">Asia/Jakarta (WIB - UTC+7)</option>
                      <option value="Asia/Makassar">Asia/Makassar (WITA - UTC+8)</option>
                      <option value="Asia/Jayapura">Asia/Jayapura (WIT - UTC+9)</option>
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+8)</option>
                      <option value="America/New_York">America/New_York (EST/EDT - UTC-5/UTC-4)</option>
                      <option value="Europe/London">Europe/London (GMT/BST - UTC+0/UTC+1)</option>
                      <option value="Europe/Paris">Europe/Paris (CET/CEST - UTC+1/UTC+2)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST - UTC+9)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                      Select the primary timezone for cron schedulers and system clock logic.
                    </p>
                  </div>

                  {/* Modular Feature Checkboxes */}
                  <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-3 select-none">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5 block">
                      Optional Application Modules
                    </label>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold leading-normal pb-1">
                      Uncheck modules you do not need to save system memory (RAM), process count, and CPU cycles.
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800/80 hover:bg-slate-100/40 dark:hover:bg-slate-900/40 transition cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureCctv}
                          onChange={(e) => setFeatureCctv(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600 accent-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">CCTV Streams</p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold leading-normal mt-0.5">Automated RTSP/HLS streams archiving</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800/80 hover:bg-slate-100/40 dark:hover:bg-slate-900/40 transition cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureWebdav}
                          onChange={(e) => setFeatureWebdav(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600 accent-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">WebDAV Drive Access</p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold leading-normal mt-0.5">Expose files folder mounting endpoints</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800/80 hover:bg-slate-100/40 dark:hover:bg-slate-900/40 transition cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureIntegrations}
                          onChange={(e) => setFeatureIntegrations(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600 accent-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Messenger Bots</p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold leading-normal mt-0.5">Telegram, Slack, and WhatsApp clients</p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800/80 hover:bg-slate-100/40 dark:hover:bg-slate-900/40 transition cursor-pointer">
                        <input
                          type="checkbox"
                          checked={featureBackups}
                          onChange={(e) => setFeatureBackups(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600 accent-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">DB Backup Scheduler</p>
                          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold leading-normal mt-0.5">Cron automation database dump exports</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* STEP 3: GOOGLE OAUTH */}
            {step === 3 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Globe className="text-blue-500" size={20} />
                      Google Drive API Configuration
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                      Configure credentials to access Google Drive cloud storage (Optional).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOAuthHelp(!showOAuthHelp)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-black text-slate-600 dark:text-slate-300 transition cursor-pointer"
                  >
                    <HelpCircle size={12} />
                    Instructions Guide
                  </button>
                </div>

                {/* Documentation / Instructions panel */}
                {showOAuthHelp && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed space-y-2 animate-in fade-in duration-200">
                    <div className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1">
                      <Settings size={12} className="text-blue-500" />
                      How to get Google Drive credentials:
                    </div>
                    <ol className="list-decimal pl-4 space-y-1.5 font-semibold">
                      <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" className="text-blue-500 hover:underline">Google Cloud Console</a> and create/select a project.</li>
                      <li>Go to **APIs & Services** &gt; **Library**, search for **Google Drive API**, select it, and click **Enable**.</li>
                      <li>Go to the **OAuth consent screen** tab, set type to **External**, enter your email, configure scope endpoints (`drive`, `userinfo.email`), and register your login email under **Test Users**.</li>
                      <li><span className="text-blue-500 dark:text-blue-400 font-bold">Publish your App (Critical)</span>: Still on the **OAuth consent screen** tab under **Publishing status**, click the **Publish App** button to switch it from <em>Testing</em> to <em>In Production</em>. If left in <em>Testing</em>, Google will automatically expire user access authorizations after 7 days, forcing you to re-link accounts weekly.</li>
                      <li>Go to **Credentials** &gt; **Create Credentials** &gt; **OAuth client ID** &gt; choose **Web application** type.</li>
                      <li>Under **Authorized JavaScript origins**, click **Add URI** and enter the website address below (this tells Google which website is allowed to request access):
                        <code className="block mt-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[10px] select-all text-blue-600 dark:text-blue-400 font-bold">
                          {appUrl}
                        </code>
                      </li>
                      <li>Under **Authorized Redirect URIs**, click **Add URI** and enter the callback address below (this is the special link where Google sends users back after authentication):
                        <code className="block mt-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[10px] select-all text-blue-600 dark:text-blue-400 font-bold">
                          {googleRedirectUri}
                        </code>
                      </li>
                      <li>Copy the generated **Client ID** and **Client Secret** and fill them in below.</li>
                    </ol>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Google Client ID</label>
                    <input
                      type="text"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 transition font-mono"
                      placeholder="10243567-xxxxxx.apps.googleusercontent.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Google Client Secret</label>
                    <input
                      type="password"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 transition font-mono"
                      placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Google Redirect Callback URI</label>
                    <input
                      type="url"
                      value={googleRedirectUri}
                      onChange={(e) => setGoogleRedirectUri(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-slate-500 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 transition font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
            {/* STEP 4: LOCAL STORAGE MOUNT */}
            {step === 4 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Folder className="text-blue-500" size={20} />
                    Local Server Storage Mounting
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                    Configure server directories to mount as workspace partitions (Optional).
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Storage Mount Display Name</label>
                    <div className="relative">
                      <Database size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                        placeholder="Local Storage"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Server Directory Folder Path</label>
                    <div className="relative">
                      <Folder size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="text"
                        value={localPath}
                        onChange={(e) => setLocalPath(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                        placeholder="./storage/local"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold px-0.5">Capacity Allocation Limit (GB)</label>
                    <div className="relative">
                      <Settings size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        type="number"
                        value={localQuotaGb}
                        onChange={(e) => setLocalQuotaGb(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 focus:bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-200 font-medium transition"
                        placeholder="50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wizard Navigation Action Row */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-6 mt-8 gap-4">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handlePrevStep}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Skip buttons on step 3 & 4 */}
              {step === 3 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep(4)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Skip Google Client Config
                </button>
              )}

              {step === 4 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => handleInstall(e, googleClientId === "" || googleClientSecret === "", true)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Skip Local drive Setup & Install
                </button>
              )}

              {/* Next/Complete Button */}
              {step < 4 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/10 transition cursor-pointer"
                >
                  Next Step
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => handleInstall(e, googleClientId === "" || googleClientSecret === "", false)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-500/15 transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white/35 border-t-white animate-spin" />
                  ) : (
                    "Save & Finish Onboarding"
                  )}
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
