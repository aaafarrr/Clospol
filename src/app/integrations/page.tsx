"use client";

import React, { useState, useEffect, useRef } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import Link from "next/link";
import { useToast } from "@/components/providers/toast-provider";

interface IntegrationItem {
  id: string;
  provider: string;
  integrationName: string;
  status: string;
  isActive: boolean;
  sessionId: string | null;
  lastError: string | null;
}

interface StorageAccount {
  id: string;
  displayName: string;
  provider: string;
}

export default function IntegrationsPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_INTEGRATIONS === "false") {
    return (
      <SidebarLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4 animate-in fade-in duration-200">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-2xl shadow-sm">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Integrations Feature Disabled</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            The Messenger Bot Integrations (Telegram, Discord, Slack, WhatsApp) has been disabled during installation. Contact your administrator or update your environment configuration to enable this module.
          </p>
        </div>
      </SidebarLayout>
    );
  }

  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [storageAccounts, setStorageAccounts] = useState<StorageAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);

  const toast = useToast();

  const [editingIntegration, setEditingIntegration] = useState<IntegrationItem | null>(null);

  const startEditIntegration = (item: IntegrationItem) => {
    setEditingIntegration(item);
    if (item.provider === "telegram") {
      setCurrentForm("telegram");
      setTelegramForm({ name: item.integrationName, botToken: "", accountId: "routing_policy" });
    } else if (item.provider === "discord") {
      setCurrentForm("discord");
      setDiscordForm({ name: item.integrationName, botToken: "", accountId: "routing_policy" });
    } else if (item.provider === "slack") {
      setCurrentForm("slack");
      setSlackForm({ name: item.integrationName, botToken: "", accountId: "routing_policy" });
    } else if (item.provider === "whatsapp") {
      setCurrentForm("whatsapp_un");
      setWaUnForm({ name: item.integrationName, accountId: "routing_policy" });
    } else if (item.provider === "whatsapp_official") {
      setCurrentForm("whatsapp");
      setWaOfficialForm({ name: item.integrationName, phoneNumberId: "", accessToken: "", verifyToken: "", accountId: "routing_policy" });
    }
    showToast(`Mengedit integrasi: ${item.integrationName}`, "info");
  };

  const cancelEditIntegration = () => {
    setEditingIntegration(null);
    setTelegramForm({ name: "", botToken: "", accountId: "routing_policy" });
    setDiscordForm({ name: "", botToken: "", accountId: "routing_policy" });
    setSlackForm({ name: "", botToken: "", accountId: "routing_policy" });
    setWaUnForm({ name: "", accountId: "routing_policy" });
    setWaOfficialForm({ name: "", phoneNumberId: "", accessToken: "", verifyToken: "", accountId: "routing_policy" });
  };

  const changeFormTab = (tab: "telegram" | "discord" | "slack" | "whatsapp_un" | "whatsapp") => {
    cancelEditIntegration();
    setCurrentForm(tab);
  };

  const refreshIntegrationStatus = async (item: IntegrationItem) => {
    showToast(`Menyegarkan status ${item.integrationName}...`, "info");
    if (item.provider === "whatsapp" && item.sessionId) {
      try {
        const res = await fetch(`/api/integrations/${item.sessionId}/status`);
        if (res.ok) {
          const data = await res.json();
          setLiveStatuses((prev) => ({ ...prev, [item.id]: data.status }));
          showToast(`Status WhatsApp: ${data.status.replace("_", " ")}`, "success");
        } else {
          showToast("Gagal mengambil status WhatsApp.", "error");
        }
      } catch (_) {
        showToast("Error mengambil status WhatsApp.", "error");
      }
    } else {
      await loadData();
      showToast("Status integrasi disegarkan.", "success");
    }
  };

  const handleUpdateIntegration = async (id: string, name: string, botToken?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationName: name,
          botToken,
        }),
      });
      if (res.ok) {
        showToast("Integrasi berhasil diperbarui.", "success");
        cancelEditIntegration();
        loadData();
        return true;
      } else {
        const data = await res.json();
        showToast("Gagal memperbarui: " + (data.error || "Unknown"), "error");
        return false;
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal memperbarui integrasi.", "error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info" | "warning" = "success") => {
    toast.toast(message, type);
  };

  // QR Modal States
  const [showQrModal, setShowQrModal] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [qrCodeImg, setQrCodeImg] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState("disconnected");
  
  // Forms tab selection
  const [currentForm, setCurrentForm] = useState<"telegram" | "discord" | "slack" | "whatsapp_un" | "whatsapp">("telegram");

  // Form Inputs
  const [telegramForm, setTelegramForm] = useState({ name: "", botToken: "", accountId: "routing_policy" });
  const [discordForm, setDiscordForm] = useState({ name: "", botToken: "", accountId: "routing_policy" });
  const [slackForm, setSlackForm] = useState({ name: "", botToken: "", accountId: "routing_policy" });
  const [waUnForm, setWaUnForm] = useState({ name: "", accountId: "routing_policy" });
  const [waOfficialForm, setWaOfficialForm] = useState({ name: "", phoneNumberId: "", accessToken: "", verifyToken: "", accountId: "routing_policy" });

  const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({});
  
  const qrModalRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = async () => {
    try {
      const integrationsRes = await fetch("/api/integrations");
      if (integrationsRes.ok) {
        const integrationsData = await integrationsRes.json();
        const list: IntegrationItem[] = integrationsData.integrations || [];
        setIntegrations(list);

        // Fetch live status for WhatsApp sessions concurrently in parallel
        const waIntegrations = list.filter(item => item.provider === "whatsapp" && item.sessionId);
        
        // Pre-fill statuses with "checking..." to prevent empty flash
        const initialStatuses: Record<string, string> = {};
        waIntegrations.forEach(item => {
          initialStatuses[item.id] = "checking...";
        });
        setLiveStatuses(initialStatuses);

        // Query status endpoints concurrently in background
        Promise.all(
          waIntegrations.map(async (item) => {
            try {
              const statusRes = await fetch(`/api/integrations/${item.sessionId}/status`);
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                return { id: item.id, status: statusData.status };
              }
            } catch (_) {}
            return { id: item.id, status: "offline" };
          })
        ).then((results) => {
          const updatedStatuses = { ...initialStatuses };
          results.forEach(({ id, status }) => {
            updatedStatuses[id] = status;
          });
          setLiveStatuses(updatedStatuses);
        });
      }

      const storageRes = await fetch("/api/storages");
      if (storageRes.ok) {
        const storageData = await storageRes.json();
        setStorageAccounts(storageData.accounts || []);
      }
    } catch (err) {
      console.error("Error loading integrations:", err);
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // General status polling for unconnected WhatsApp sessions
  useEffect(() => {
    const unconnectedWa = integrations.filter(
      (item) => item.provider === "whatsapp" && liveStatuses[item.id] !== "connected"
    );

    if (unconnectedWa.length === 0) return;

    const interval = setInterval(async () => {
      const updatedStatuses = { ...liveStatuses };
      let changed = false;

      await Promise.all(
        unconnectedWa.map(async (item) => {
          try {
            const res = await fetch(`/api/integrations/${item.sessionId}/status`);
            if (res.ok) {
              const data = await res.json();
              if (liveStatuses[item.id] !== data.status) {
                updatedStatuses[item.id] = data.status;
                changed = true;
              }
            }
          } catch (_) {}
        })
      );

      if (changed) {
        setLiveStatuses(updatedStatuses);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [integrations, liveStatuses]);

  const openQrModal = async (integration: IntegrationItem) => {
    const sessionId = integration.sessionId || integration.id;
    setActiveSessionId(sessionId);
    setQrCodeImg(null);
    setSessionStatus("connecting");
    setShowQrModal(true);

    try {
      // Start session
      await fetch(`/api/integrations/${sessionId}/start`, { method: "POST" });
      
      // Poll WhatsApp status
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/integrations/${sessionId}/status`);
          if (res.ok) {
            const data = await res.json();
            setSessionStatus(data.status);
            setQrCodeImg(data.qr);
            setLiveStatuses((prev) => ({ ...prev, [integration.id]: data.status }));

            if (data.status === "connected") {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setShowQrModal(false);
              showToast("WhatsApp Unofficial linked and connected successfully!", "success");
              loadData();
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 2000);
    } catch (err) {
      console.error(err);
      showToast("Could not start WhatsApp session.", "error");
      setShowQrModal(false);
    }
  };

  const closeQrModal = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setShowQrModal(false);
    loadData();
  };

  const deleteIntegration = async (id: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) return;
    try {
      const res = await fetch(`/api/integrations/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Integration deleted successfully.", "success");
        loadData();
      } else {
        showToast("Failed to delete integration.", "error");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveIntegration = async (provider: string, name: string, botToken: string, sessionId?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          integrationName: name,
          botToken,
          sessionId,
        }),
      });
      if (res.ok) {
        showToast(`${provider.replace("_", " ")} integration created successfully.`, "success");
        loadData();
        return true;
      } else {
        const data = await res.json();
        showToast("Error: " + (data.error || "Failed to create integration"), "error");
        return false;
      }
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const saveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIntegration) {
      await handleUpdateIntegration(editingIntegration.id, telegramForm.name, telegramForm.botToken);
    } else {
      const success = await handleSaveIntegration("telegram", telegramForm.name, telegramForm.botToken);
      if (success) setTelegramForm({ name: "", botToken: "", accountId: "routing_policy" });
    }
  };

  const saveDiscord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIntegration) {
      await handleUpdateIntegration(editingIntegration.id, discordForm.name, discordForm.botToken);
    } else {
      const success = await handleSaveIntegration("discord", discordForm.name, discordForm.botToken);
      if (success) setDiscordForm({ name: "", botToken: "", accountId: "routing_policy" });
    }
  };

  const saveSlack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIntegration) {
      await handleUpdateIntegration(editingIntegration.id, slackForm.name, slackForm.botToken);
    } else {
      const success = await handleSaveIntegration("slack", slackForm.name, slackForm.botToken);
      if (success) setSlackForm({ name: "", botToken: "", accountId: "routing_policy" });
    }
  };

  const saveWhatsAppUnofficial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIntegration) {
      await handleUpdateIntegration(editingIntegration.id, waUnForm.name);
    } else {
      const sessId = `wa_session_${Math.random().toString(36).substring(2, 10)}`;
      const success = await handleSaveIntegration("whatsapp", waUnForm.name, "", sessId);
      if (success) setWaUnForm({ name: "", accountId: "routing_policy" });
    }
  };

  const saveWhatsAppOfficial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIntegration) {
      const hasNewToken = waOfficialForm.phoneNumberId || waOfficialForm.accessToken || waOfficialForm.verifyToken;
      const compositeToken = `${waOfficialForm.phoneNumberId}:${waOfficialForm.accessToken}:${waOfficialForm.verifyToken}`;
      await handleUpdateIntegration(editingIntegration.id, waOfficialForm.name, hasNewToken ? compositeToken : undefined);
    } else {
      const compositeToken = `${waOfficialForm.phoneNumberId}:${waOfficialForm.accessToken}:${waOfficialForm.verifyToken}`;
      const success = await handleSaveIntegration("whatsapp_official", waOfficialForm.name, compositeToken);
      if (success) setWaOfficialForm({ name: "", phoneNumberId: "", accessToken: "", verifyToken: "", accountId: "routing_policy" });
    }
  };

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (qrModalRef.current && !qrModalRef.current.contains(target)) {
        closeQrModal();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Webhook details copied to clipboard.", "success");
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Messenger Integrations</h1>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
              Connect WhatsApp and Telegram accounts to auto-save incoming images and files to your cloud storage
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-center">
            <Link 
              href="/integrations/feed"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-250 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 font-bold text-sm shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="fa-regular fa-message text-base"></i>
              <span>Lihat Feed Pesan</span>
            </Link>
            <Link 
              href="/integrations/gallery"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="fa-solid fa-images text-base"></i>
              <span>Lihat File Tersimpan</span>
            </Link>
          </div>
        </div>

        {/* Integration Capabilities Card */}
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <button 
            type="button"
            onClick={() => setShowCapabilities(!showCapabilities)}
            className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer group"
          >
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <i className="fa-solid fa-circle-info text-blue-500"></i> What Can You Do with These Integrations?
              </h2>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                Core features that run automatically after connecting your messaging channels
              </p>
            </div>
            <div className={`h-8 w-8 rounded-xl bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition shrink-0 ${showCapabilities ? 'rotate-180' : ''}`}>
              <i className="fa-solid fa-chevron-down text-xs"></i>
            </div>
          </button>

          {showCapabilities && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Feature 1 */}
              <div className="flex gap-3 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-cloud-arrow-down text-sm"></i>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">Auto-Save Attachments</h4>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                    Any image, document, video, or audio sent to your bots/groups will be downloaded and saved to your cloud storage automatically.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex gap-3 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-folder-tree text-sm"></i>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">Organized Folder Structure</h4>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                    Files are structured automatically by source: <code className="font-mono text-[9px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-blue-500">Platform/Bot Name &rarr; Chat Type &rarr; Chat Name &rarr; YYYY-MM</code>.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex gap-3 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80">
                <div className="h-8 w-8 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-route text-sm"></i>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">Upload Routing Policy</h4>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                    Integrations follow your custom Upload Routing Policy (Google Drive, OneDrive, Dropbox, S3, Local) depending on file sizes and storage capacity.
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="flex gap-3 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <i className="fa-solid fa-bolt text-sm"></i>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">Real-Time Syncing</h4>
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                    Uses Webhooks (Telegram, Slack, WA Official) & Active Socket Connections (Discord, WA Unofficial) for instant syncing in seconds.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column: List & Tutorial */}
          <div className="lg:col-span-2 space-y-6">

            {/* Integrations List Card */}
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">
                  <i className="fa-solid fa-link mr-1 text-blue-500"></i> Linked Accounts & Bots
                </h2>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Active messenger webhooks linked to your cloud storage backends</p>
              </div>

              <div className="space-y-3">
                {integrations.length === 0 ? (
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 py-8 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl">
                    No integrations configured yet. Use the panel on the right to add your first bot or WhatsApp webhook.
                  </p>
                ) : (
                  integrations.map((item) => {
                    const isWhatsAppUn = item.provider === "whatsapp";
                    return (
                      <div 
                        key={item.id} 
                        className="border border-slate-200/60 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Provider Badge Icon */}
                            <div className={`h-10 w-10 rounded-xl font-bold flex items-center justify-center shrink-0 uppercase text-white shadow-md ${
                              item.provider === "telegram"
                                ? "bg-gradient-to-tr from-sky-400 to-sky-500 shadow-sky-500/10"
                                : item.provider === "discord"
                                ? "bg-gradient-to-tr from-indigo-500 to-indigo-600 shadow-indigo-500/10"
                                : item.provider === "slack"
                                ? "bg-gradient-to-tr from-amber-500 to-amber-600 shadow-amber-500/10"
                                : "bg-gradient-to-tr from-emerald-500 to-emerald-600 shadow-emerald-500/10"
                            }`}>
                              {item.provider === "telegram" && <i className="fa-brands fa-telegram text-xl"></i>}
                              {item.provider === "discord" && <i className="fa-brands fa-discord text-xl"></i>}
                              {item.provider === "slack" && <i className="fa-brands fa-slack text-xl"></i>}
                              {item.provider === "whatsapp" && <i className="fa-brands fa-whatsapp text-xl"></i>}
                              {item.provider === "whatsapp_official" && <i className="fa-brands fa-whatsapp text-xl"></i>}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-black text-slate-800 dark:text-slate-200 text-sm">{item.integrationName}</p>
                                <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase text-white tracking-wider ${
                                  item.provider === "telegram"
                                    ? "bg-sky-500"
                                    : item.provider === "discord"
                                    ? "bg-indigo-500"
                                    : item.provider === "slack"
                                    ? "bg-amber-500"
                                    : "bg-emerald-600"
                                }`}>
                                  {item.provider.replace("_", " ")}
                                </span>
                              </div>
                              <p className="truncate text-xs text-slate-400 dark:text-slate-500 font-semibold">
                                Target Storage: Dynamic (Upload Routing Policy)
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {isWhatsAppUn && (
                              <div className="flex items-center gap-2.5">
                                {/* Status Badges */}
                                {liveStatuses[item.id] === "connected" && (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-xl uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Connected
                                  </span>
                                )}
                                {(liveStatuses[item.id] === "connecting" || liveStatuses[item.id] === "checking...") && (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-xl uppercase bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center gap-1.5">
                                    <span className="animate-spin rounded-full h-2 w-2 border border-amber-500 border-t-transparent"></span>
                                    {liveStatuses[item.id] === "connecting" ? "Connecting" : "Checking"}
                                  </span>
                                )}
                                {liveStatuses[item.id] === "qr_ready" && (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-xl uppercase bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center gap-1">
                                    <i className="fa-solid fa-qrcode text-[9px]"></i>
                                    Scan Required
                                  </span>
                                )}
                                {(liveStatuses[item.id] === "disconnected" || liveStatuses[item.id] === "offline") && (
                                  <span className="text-[10px] font-black px-2.5 py-1 rounded-xl uppercase bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-450">
                                    Disconnected
                                  </span>
                                )}

                                {/* Scan QR Button - only show when scan is required or disconnected/offline */}
                                {(liveStatuses[item.id] === "qr_ready" || liveStatuses[item.id] === "disconnected" || liveStatuses[item.id] === "offline") && (
                                  <button 
                                    onClick={() => openQrModal(item)} 
                                    className="h-8 bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600 font-extrabold px-3.5 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-95 transform text-[10px]"
                                  >
                                    <i className="fa-solid fa-qrcode text-[10px]"></i>
                                    Scan QR
                                  </button>
                                )}
                              </div>
                            )}
                            <Link
                              href={`/integrations/feed?integrationId=${item.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-[10px] font-bold shadow-sm transition cursor-pointer shrink-0"
                              title="Lihat feed pesan masuk"
                            >
                              <i className="fa-regular fa-message"></i>
                              <span>Lihat Feed</span>
                            </Link>
                            <Link
                              href={`/integrations/gallery?integrationId=${item.id}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-[10px] font-bold shadow-sm transition cursor-pointer shrink-0"
                              title="Lihat file yang disimpan"
                            >
                              <i className="fa-solid fa-images"></i>
                              <span>Lihat File</span>
                            </Link>
                            <button 
                              onClick={() => refreshIntegrationStatus(item)} 
                              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                              title="Refresh Status"
                            >
                              <i className="fa-solid fa-rotate text-sm"></i>
                            </button>
                            <button 
                              onClick={() => startEditIntegration(item)} 
                              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                              title="Edit"
                            >
                              <i className="fa-solid fa-pen text-sm"></i>
                            </button>
                            <button 
                              onClick={() => deleteIntegration(item.id)} 
                              className="rounded-lg p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400 hover:text-red-600 transition cursor-pointer"
                              title="Delete"
                            >
                              <i className="fa-solid fa-trash-can text-sm"></i>
                            </button>
                          </div>

                        </div>

                        {isWhatsAppUn && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-semibold leading-relaxed shadow-sm">
                            <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 shrink-0 text-[13px]"></i>
                            <div>
                              <span className="font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 mr-1">IMPORTANT (DYOR - Do Your Own Risk):</span> 
                              This is an Unofficial WhatsApp integration (Baileys). WhatsApp does not officially support this method, and using an unofficial API carries the risk of your phone number being banned by WhatsApp. Please use it wisely and at your own risk.
                            </div>
                          </div>
                        )}

                        {/* Webhook details for official hooks */}
                        {!isWhatsAppUn && (
                          <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                            <span className="text-slate-400 dark:text-slate-500 block text-[9px] uppercase font-black tracking-wider">Webhook URL</span>
                            <div className="flex items-center justify-between gap-3">
                              <code className="text-slate-800 dark:text-slate-200 truncate font-mono text-[10px] select-all">
                                {typeof window !== "undefined" ? `${window.location.origin}/api/messenger-webhook/${item.id}` : `/api/messenger-webhook/${item.id}`}
                              </code>
                              <button 
                                onClick={() => copyText(typeof window !== "undefined" ? `${window.location.origin}/api/messenger-webhook/${item.id}` : `/api/messenger-webhook/${item.id}`)} 
                                className="text-blue-500 hover:text-blue-700 font-bold shrink-0 cursor-pointer"
                              >
                                <i className="fa-solid fa-copy text-xs"></i>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Forms & Tutorials */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">
                    {editingIntegration ? "Edit Integration" : "Add Integration"}
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    {editingIntegration ? `Updating: ${editingIntegration.integrationName}` : "Connect a new messenger account"}
                  </p>
                </div>
                {editingIntegration && (
                  <button
                    type="button"
                    onClick={cancelEditIntegration}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-650 dark:text-slate-300 text-[10px] font-extrabold transition cursor-pointer"
                  >
                    Batal Edit
                  </button>
                )}
              </div>

              {/* Form Tabs */}
              <div className="flex flex-col bg-slate-100 dark:bg-slate-950 p-1 rounded-xl gap-1 text-[10px] font-bold">
                <div className="flex gap-1">
                  <button type="button" onClick={() => changeFormTab("telegram")} className={`flex-1 py-1.5 text-center rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${currentForm === 'telegram' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400'}`}><i className="fa-brands fa-telegram text-sky-500"></i> Telegram</button>
                  <button type="button" onClick={() => changeFormTab("discord")} className={`flex-1 py-1.5 text-center rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${currentForm === 'discord' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400'}`}><i className="fa-brands fa-discord text-indigo-500"></i> Discord</button>
                  <button type="button" onClick={() => changeFormTab("slack")} className={`flex-1 py-1.5 text-center rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${currentForm === 'slack' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400'}`}><i className="fa-brands fa-slack text-amber-500"></i> Slack</button>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => changeFormTab("whatsapp_un")} className={`flex-1 py-1.5 text-center rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${currentForm === 'whatsapp_un' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400'}`}><i className="fa-brands fa-whatsapp text-teal-500"></i> WA Unofficial</button>
                  <button type="button" onClick={() => changeFormTab("whatsapp")} className={`flex-1 py-1.5 text-center rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${currentForm === 'whatsapp' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400'}`}><i className="fa-brands fa-whatsapp text-emerald-500"></i> WA Official</button>
                </div>
              </div>

              {/* Telegram Bot Form & Tutorial */}
              {currentForm === "telegram" && (
                <div className="space-y-5">
                  <form onSubmit={saveTelegram} className="space-y-4 text-xs">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Friendly Name</label>
                      <input 
                        type="text" 
                        value={telegramForm.name} 
                        onChange={(e) => setTelegramForm({ ...telegramForm, name: e.target.value })} 
                        required 
                        placeholder="e.g. Sales Telegram Bot" 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Bot API Token</label>
                      <input 
                        type="text" 
                        value={telegramForm.botToken} 
                        onChange={(e) => setTelegramForm({ ...telegramForm, botToken: e.target.value })} 
                        required={!editingIntegration} 
                        placeholder="123456789:ABCdefGhI..." 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/10 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <span>{editingIntegration ? "Simpan Perubahan" : "Add Telegram Bot"}</span>
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-slate-150 dark:border-slate-800 space-y-3">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                      <i className="fa-solid fa-graduation-cap text-sky-500"></i> Setup Instructions
                    </h4>
                    <ol className="list-decimal pl-4 space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                      <li>
                        Open Telegram and search for <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-bold">@BotFather</a>.
                      </li>
                      <li>
                        Send the command <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-950 rounded text-red-500 font-mono">/newbot</code> and follow the prompts to choose a display name and username for your bot.
                      </li>
                      <li>
                        Copy the **API Token** provided (looks like <code className="font-mono text-[10px]">12345678:ABCdef...</code>) and paste it into the form above, then click **Add Telegram Bot**.
                      </li>
                      <li>
                        <strong>Crucial Webhook Step:</strong> Telegram requires you to explicitly register a Webhook URL so it can push incoming files to your gateway.
                        <ul className="list-disc pl-4 mt-1.5 space-y-1.5">
                          <li>Once your bot is saved, copy its <strong>Webhook URL</strong> from the list on the left.</li>
                          <li>Open your web browser, paste the following URL in the address bar (make sure to replace <code className="font-mono text-[9px] bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded text-blue-500">&lt;BOT_TOKEN&gt;</code> and <code className="font-mono text-[9px] bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded text-blue-500">&lt;WEBHOOK_URL&gt;</code> with your actual values) and press Enter:</li>
                          <li className="font-mono text-[9px] bg-slate-50 dark:bg-slate-950/60 p-2 rounded border border-slate-150 dark:border-slate-800 break-all select-all text-blue-600 dark:text-blue-400 leading-normal">
                            https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/setWebhook?url=&lt;WEBHOOK_URL&gt;
                          </li>
                          <li>You should receive a success response: <code className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">{"{\"ok\":true,\"result\":true,\"description\":\"Webhook was set\"}"}</code>.</li>
                        </ul>
                      </li>
                      <li>
                        Send any image or file to your bot in Telegram. It will automatically download and sync to your Clospol storage accounts!
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Discord Bot Form & Tutorial */}
              {currentForm === "discord" && (
                <div className="space-y-5">
                  <form onSubmit={saveDiscord} className="space-y-4 text-xs">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Friendly Name</label>
                      <input 
                        type="text" 
                        value={discordForm.name} 
                        onChange={(e) => setDiscordForm({ ...discordForm, name: e.target.value })} 
                        required 
                        placeholder="e.g. Discord Archive Bot" 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Discord Bot Token</label>
                      <input 
                        type="password" 
                        value={discordForm.botToken} 
                        onChange={(e) => setDiscordForm({ ...discordForm, botToken: e.target.value })} 
                        required={!editingIntegration} 
                        placeholder="e.g. MTY3OTI0..." 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                      />
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-500/10 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <span>{editingIntegration ? "Simpan Perubahan" : "Add Discord Bot"}</span>
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-slate-150 dark:border-slate-800 space-y-3">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                      <i className="fa-solid fa-graduation-cap text-indigo-500"></i> Setup Instructions
                    </h4>
                    <ol className="list-decimal pl-4 space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                      <li>
                        Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-bold">Discord Developer Portal</a>.
                      </li>
                      <li>
                        Click <strong>New Application</strong> at the top right, pick a name, and click <strong>Create</strong>.
                      </li>
                      <li>
                        Go to the <strong>Bot</strong> tab in the left sidebar, click <strong>Reset Token</strong>, and copy the client token. Paste it into the token input field above.
                      </li>
                      <li>
                        Scroll down on the same <strong>Bot</strong> page to find the <strong>Privileged Gateway Intents</strong> section. Enable the <strong>Message Content Intent</strong> switch (this is mandatory for Clospol to read attachments). Click <strong>Save Changes</strong>.
                      </li>
                      <li>
                        Go to the <strong>OAuth2</strong> &rarr; <strong>URL Generator</strong> tab. Under <strong>Scopes</strong> check <code className="font-mono text-[9.5px]">bot</code>. Under <strong>Bot Permissions</strong> check <code className="font-mono text-[9.5px]">Read Messages/View Channels</code> and <code className="font-mono text-[9.5px]">Read Message History</code>.
                      </li>
                      <li>
                        Copy the generated invite link at the bottom of the page, open it in a new browser tab, and authorize the bot to join your Discord server.
                      </li>
                      <li>
                        Click <strong>Add Discord Bot</strong> above. The gateway daemon will instantly connect to Discord. Any attachments posted in channels the bot has access to will automatically sync.
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* Slack Bot Form & Tutorial */}
              {currentForm === "slack" && (
                <div className="space-y-5">
                  <form onSubmit={saveSlack} className="space-y-4 text-xs">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Friendly Name</label>
                      <input 
                        type="text" 
                        value={slackForm.name} 
                        onChange={(e) => setSlackForm({ ...slackForm, name: e.target.value })} 
                        required 
                        placeholder="e.g. Invoices Slack Bot" 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Slack OAuth Token</label>
                      <input 
                        type="text" 
                        value={slackForm.botToken} 
                        onChange={(e) => setSlackForm({ ...slackForm, botToken: e.target.value })} 
                        required={!editingIntegration} 
                        placeholder="xoxb-..." 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-md shadow-amber-500/10 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <span>{editingIntegration ? "Simpan Perubahan" : "Add Slack Bot"}</span>
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-slate-150 dark:border-slate-800 space-y-3">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                      <i className="fa-solid fa-graduation-cap text-amber-500"></i> Setup Instructions
                    </h4>
                    <ol className="list-decimal pl-4 space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                      <li>
                        Visit the <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-bold">Slack API Console</a> and click <strong>Create New App</strong> &rarr; <strong>From scratch</strong>. Name your app and select your development workspace.
                      </li>
                      <li>
                        Go to <strong>OAuth & Permissions</strong> in the left sidebar. Scroll down to <strong>Scopes</strong> &rarr; <strong>Bot Token Scopes</strong> and click <strong>Add an OAuth Scope</strong>. Add:
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5 font-bold">
                          <li><code>files:read</code></li>
                          <li><code>channels:history</code></li>
                        </ul>
                      </li>
                      <li>
                        Scroll back up and click <strong>Install to Workspace</strong>, then click <strong>Allow</strong>.
                      </li>
                      <li>
                        Copy the generated <strong>Bot User OAuth Token</strong> (starts with <code className="font-mono">xoxb-</code>) and save it in the form above, then click <strong>Add Slack Bot</strong>.
                      </li>
                      <li>
                        Once created, copy the <strong>Webhook URL</strong> from the integration card on the left.
                      </li>
                      <li>
                        Go back to your Slack App Settings and choose <strong>Event Subscriptions</strong> in the left sidebar.
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                          <li>Toggle the switch to <strong>On</strong>.</li>
                          <li>Paste your copied Webhook URL into the <strong>Request URL</strong> field. Slack will immediately send a verification request and display a green "Verified" checkmark.</li>
                          <li>Expand <strong>Subscribe to bot events</strong>, click <strong>Add Bot User Event</strong>, and choose <strong>message.channels</strong>.</li>
                          <li>Click <strong>Save Changes</strong> at the bottom of the page.</li>
                        </ul>
                      </li>
                      <li>
                        Invite your bot to any Slack channel (e.g. by typing <code className="font-mono">/invite @YourBotName</code>). Any image or file uploaded to that channel will sync to your storage!
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* WhatsApp Unofficial Form & Tutorial */}
              {currentForm === "whatsapp_un" && (
                <div className="space-y-5">
                  <form onSubmit={saveWhatsAppUnofficial} className="space-y-4 text-xs">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Friendly Name</label>
                      <input 
                        type="text" 
                        value={waUnForm.name} 
                        onChange={(e) => setWaUnForm({ ...waUnForm, name: e.target.value })} 
                        required 
                        placeholder="e.g. Personal WhatsApp Bot" 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-md shadow-teal-500/10 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <span>{editingIntegration ? "Simpan Perubahan" : "Create WhatsApp Session"}</span>
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-slate-150 dark:border-slate-800 space-y-3">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                      <i className="fa-solid fa-graduation-cap text-teal-500"></i> Setup Instructions
                    </h4>
                    <ol className="list-decimal pl-4 space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                      <li>
                        Enter a friendly session name above and click <strong>Create WhatsApp Session</strong>.
                      </li>
                      <li>
                        The new session will appear on the left with a "Disconnected" or "Offline" status.
                      </li>
                      <li>
                        Click the <strong>Scan QR</strong> button on that card. A pop-up modal containing a dynamic WhatsApp Web QR code will open.
                      </li>
                      <li>
                        Open WhatsApp on your physical phone, go to <strong>Linked Devices</strong> (or tap Menu &rarr; Linked Devices), tap <strong>Link a Device</strong>, and scan the QR code.
                      </li>
                      <li>
                        The status will update to "Connected". Clospol will now listen to your chats and auto-save incoming media to your storage accounts.
                      </li>
                      <li>
                        <em>Note: Using unofficial libraries carries a risk of account suspension by WhatsApp. We recommend using a spare number.</em>
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {/* WhatsApp Official Form & Tutorial */}
              {currentForm === "whatsapp" && (
                <div className="space-y-5">
                  <form onSubmit={saveWhatsAppOfficial} className="space-y-4 text-xs">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Friendly Name</label>
                      <input 
                        type="text" 
                        value={waOfficialForm.name} 
                        onChange={(e) => setWaOfficialForm({ ...waOfficialForm, name: e.target.value })} 
                        required 
                        placeholder="e.g. Business WhatsApp Bot" 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Phone Number ID</label>
                      <input 
                        type="text" 
                        value={waOfficialForm.phoneNumberId} 
                        onChange={(e) => setWaOfficialForm({ ...waOfficialForm, phoneNumberId: e.target.value })} 
                        required={!editingIntegration} 
                        placeholder="e.g. 10623..." 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Access Token</label>
                      <input 
                        type="text" 
                        value={waOfficialForm.accessToken} 
                        onChange={(e) => setWaOfficialForm({ ...waOfficialForm, accessToken: e.target.value })} 
                        required={!editingIntegration} 
                        placeholder="EAAG..." 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Webhook Verify Token</label>
                      <input 
                        type="text" 
                        value={waOfficialForm.verifyToken} 
                        onChange={(e) => setWaOfficialForm({ ...waOfficialForm, verifyToken: e.target.value })} 
                        required={!editingIntegration} 
                        placeholder="Verify Token of choice" 
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none font-mono"
                      />
                    </div>
                    <button type="submit" disabled={loading} className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-500/10 disabled:opacity-50 transition flex items-center justify-center gap-1.5 cursor-pointer">
                      <span>{editingIntegration ? "Simpan Perubahan" : "Add WhatsApp Config"}</span>
                    </button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-slate-150 dark:border-slate-800 space-y-3">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                      <i className="fa-solid fa-graduation-cap text-emerald-500"></i> Setup Instructions
                    </h4>
                    <ol className="list-decimal pl-4 space-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                      <li>
                        Go to the <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-bold">Meta for Developers Portal</a> and create a new <strong>Business App</strong>.
                      </li>
                      <li>
                        Add the <strong>WhatsApp</strong> product to your app. Meta will configure a sandbox test number.
                      </li>
                      <li>
                        Under the <strong>WhatsApp</strong> product menu on the left, click <strong>API Setup</strong>.
                      </li>
                      <li>
                        Copy the <strong>Phone Number ID</strong> and the temporary <strong>Access Token</strong> (or configure a Permanent Token in Meta Business Settings), and paste them into the form fields above.
                      </li>
                      <li>
                        Choose a custom, secure secret string of your choice to act as your <strong>Webhook Verify Token</strong> (e.g., <code className="font-mono">my_custom_secret_123</code>). Fill in all fields above and click <strong>Add WhatsApp Config</strong>.
                      </li>
                      <li>
                        Once created, copy the <strong>Webhook URL</strong> from the integration card on the left.
                      </li>
                      <li>
                        Go back to Meta Developers Console &rarr; <strong>WhatsApp</strong> &rarr; <strong>Configuration</strong>:
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                          <li>Click <strong>Edit</strong> next to Webhooks.</li>
                          <li>Paste the Webhook URL into the <strong>Callback URL</strong> field.</li>
                          <li>Enter your chosen secret string into the <strong>Verify Token</strong> field. Click <strong>Verify and Save</strong>. Meta will immediately ping your gateway for validation.</li>
                          <li>Under Webhook Fields, click <strong>Manage</strong> and check the box to subscribe to <strong>messages</strong> events.</li>
                        </ul>
                      </li>
                      <li>
                        Send an image or media to your WhatsApp number. The Cloud API will trigger your webhook, downloading and storing the files automatically!
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Scan Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex justify-center items-start sm:items-center p-4 animate-in fade-in duration-200 text-xs">
          <div 
            ref={qrModalRef} 
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center my-auto"
          >
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Link WhatsApp Account</h3>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Scan this QR Code in WhatsApp Linked Devices on your phone</p>

            <div className="flex items-center justify-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 min-h-64 relative">
              {qrCodeImg ? (
                <img src={qrCodeImg} className="h-56 w-56 object-contain rounded" alt="WhatsApp Link QR Code" />
              ) : (
                <div className="flex flex-col items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400 gap-3">
                  <span className="animate-spin rounded-full h-7 w-7 border-2 border-teal-600 border-t-transparent"></span>
                  <span>{sessionStatus === "connecting" ? "Initializing Baileys client..." : "Waiting for QR Code..."}</span>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-2">
              <button 
                type="button" 
                onClick={closeQrModal} 
                className="w-full h-10 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
