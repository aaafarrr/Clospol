"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";
import { useToast } from "@/components/providers/toast-provider";

interface BackupScheduleItem {
  id: string;
  name: string;
  driver: string;
  host: string | null;
  port: number | null;
  database: string;
  username: string | null;
  headers: Record<string, string>;
  cron_expression: string;
  retention_days: number;
  status: string;
  connected_account_id: string;
  connected_account: {
    id: string;
    display_name: string;
    provider: string;
  } | null;
  last_backup_at: string | null;
  last_backup_status: string | null;
  last_backup_error: string | null;
  created_at: string;
}

interface StorageAccountItem {
  id: string;
  displayName: string;
  provider: string;
}

interface HeaderRow {
  key: string;
  value: string;
}

export default function BackupsPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_BACKUPS === "false") {
    return (
      <SidebarLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4 animate-in fade-in duration-200">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-2xl shadow-sm">
            <i className="fa-solid fa-lock"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Backups Feature Disabled</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            The Database Backup Scheduler module has been disabled during installation. Contact your administrator or update your environment configuration to enable this module.
          </p>
        </div>
      </SidebarLayout>
    );
  }

  const [schedules, setSchedules] = useState<BackupScheduleItem[]>([]);
  const [storageAccounts, setStorageAccounts] = useState<StorageAccountItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const toast = useToast();
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideDbTab, setGuideDbTab] = useState<"mysql" | "pgsql" | "sqlite">("mysql");

  // Form states
  const [form, setForm] = useState({
    name: "",
    driver: "mysql",
    host: "",
    port: 3306,
    database: "",
    username: "",
    password: "",
    connectedAccountId: "routing_policy",
    cronExpression: "0 0 * * *",
    retentionDays: 7,
  });

  const [headersList, setHeadersList] = useState<HeaderRow[]>([]);

  const loadData = async () => {
    try {
      const response = await fetch("/api/database-backups");
      const data = await response.json();
      setSchedules(data.schedules || []);

      const accountsRes = await fetch("/api/storages");
      const accountsData = await accountsRes.json();
      setStorageAccounts(accountsData.accounts || []);
    } catch (err) {
      console.error("Failed to load backups page data:", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDriverChange = (driver: string) => {
    let port = 3306;
    if (driver === "pgsql") port = 5432;
    if (driver === "sqlite") port = 0;
    
    setForm((prev) => ({
      ...prev,
      driver,
      port,
    }));
  };

  const addHeaderRow = () => {
    setHeadersList((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeHeaderRow = (idx: number) => {
    setHeadersList((prev) => prev.filter((_, i) => i !== idx));
  };

  const addHeaderPreset = (type: "jwt" | "basic") => {
    if (type === "jwt") {
      setHeadersList((prev) => [...prev, { key: "Authorization", value: "Bearer " }]);
    } else if (type === "basic") {
      setHeadersList((prev) => [...prev, { key: "Authorization", value: "Basic " }]);
    }
  };

  const updateHeaderRow = (idx: number, field: "key" | "value", value: string) => {
    setHeadersList((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const getSerializedHeaders = () => {
    const headersObj: Record<string, string> = {};
    headersList.forEach((item) => {
      if (item.key.trim() !== "") {
        headersObj[item.key.trim()] = item.value;
      }
    });
    return headersObj;
  };

  const applyCronPreset = (val: string) => {
    if (val) {
      setForm((prev) => ({ ...prev, cronExpression: val }));
    }
  };

  const testDbConnection = async () => {
    if (form.driver === "sqlite") {
      if (!form.database) {
        toast.warn("Please fill SQLite File Path before testing connection.");
        return;
      }
    } else {
      if (!form.host || !form.database || !form.username) {
        toast.warn("Please fill Host, Database, and Username before testing connection.");
        return;
      }
    }

    setTestingConnection(true);
    try {
      const res = await fetch("/api/database-backups/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          driver: form.driver,
          host: form.driver === "sqlite" ? "localhost" : form.host,
          port: form.driver === "sqlite" ? 0 : Number(form.port),
          database: form.database,
          username: form.driver === "sqlite" ? "" : form.username,
          password: form.driver === "sqlite" ? "" : form.password,
          headers: getSerializedHeaders(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === "ok") {
        toast.success("Connection Succeeded! Database credentials are valid.");
      } else {
        toast.error("Connection Failed: " + (data.error || data.message || "Unknown error"));
      }
    } catch (err) {
      toast.error("Request error testing database connection.");
    } finally {
      setTestingConnection(false);
    }
  };

  const saveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/database-backups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          driver: form.driver,
          host: form.driver === "sqlite" ? "localhost" : form.host,
          port: form.driver === "sqlite" ? 0 : Number(form.port),
          database: form.database,
          username: form.driver === "sqlite" ? "" : form.username,
          password: form.driver === "sqlite" ? "" : form.password,
          connectedAccountId: form.connectedAccountId,
          cronExpression: form.cronExpression,
          retentionDays: Number(form.retentionDays),
          headers: getSerializedHeaders(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save schedule.");
      }

      toast.success("Database backup pipeline created and active successfully!");
      setForm({
        name: "",
        driver: "mysql",
        host: "",
        port: 3306,
        database: "",
        username: "",
        password: "",
        connectedAccountId: "routing_policy",
        cronExpression: "0 0 * * *",
        retentionDays: 7,
      });
      setHeadersList([]);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save schedule.");
    } finally {
      setLoading(false);
    }
  };

  const triggerBackup = async (id: string) => {
    setTriggeringId(id);

    try {
      const res = await fetch(`/api/database-backups/${id}/trigger`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Backup failed.");
      }

      toast.success("Database manual backup successfully executed and synced to your cloud storage!");
      loadData();
    } catch (err: any) {
      toast.error("Backup Failed: " + err.message);
      loadData();
    } finally {
      setTriggeringId(null);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this backup schedule? Automatic backup snapshots for this connection will be permanently stopped."
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/database-backups/${id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) throw new Error("Deletion failed");

      toast.success("Database backup schedule connection deleted successfully.");
      loadData();
    } catch (err) {
      toast.error("Failed to delete schedule.");
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Database Backups</h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Schedule automatic gzipped SQL backups of your external databases straight to your cloud storage backends
          </p>
        </div>



        {/* Tutorial & Guide Accordion */}
        <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-500/5 to-amber-600/5 dark:border-amber-900/40 p-5 shadow-sm space-y-4">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setGuideOpen(!guideOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl font-bold flex items-center justify-center shrink-0 bg-amber-500 text-white shadow-md shadow-amber-500/20">
                <i className="fa-solid fa-circle-info text-lg"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                  Database Backup Guide & Documentation
                </h3>
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                  Learn how to securely configure database backups and restrict credentials to Read-Only access
                </p>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition p-2">
              <i
                className={`fa-solid fa-chevron-down text-sm transition-transform duration-300 ${
                  guideOpen ? "rotate-180" : ""
                }`}
              ></i>
            </button>
          </div>

          {guideOpen && (
            <div className="pt-4 space-y-4 border-t border-slate-200/50 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium transition-all duration-300">
              {/* Security Warning */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold space-y-1">
                <div className="flex items-center gap-1.5 font-black">
                  <i className="fa-solid fa-shield-halved text-sm text-amber-500"></i>
                  <span>IMPORTANT: Security Policy (Read-Only)</span>
                </div>
                <p className="text-[11px] mt-1 leading-normal">
                  To protect your data integrity, Clospol <strong>requires</strong> the backup connection to use a{" "}
                  <strong>Read-Only</strong> database user. The system will automatically check user privileges and{" "}
                  <strong>reject</strong> the configuration if write or administrative permissions are detected, such
                  as{" "}
                  <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                    INSERT
                  </code>
                  ,{" "}
                  <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                    UPDATE
                  </code>
                  ,{" "}
                  <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                    DELETE
                  </code>
                  ,{" "}
                  <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                    ALTER
                  </code>
                  ,{" "}
                  <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                    CREATE
                  </code>
                  , or{" "}
                  <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[10px] text-amber-900 dark:text-amber-200">
                    ALL PRIVILEGES
                  </code>
                  .
                </p>
              </div>

              {/* Steps & Commands */}
              <div className="space-y-4">
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setGuideDbTab("mysql")}
                    className={`pb-1.5 transition ${
                      guideDbTab === "mysql"
                        ? "border-b-2 border-amber-500 text-amber-500"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    MySQL
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideDbTab("pgsql")}
                    className={`pb-1.5 transition ${
                      guideDbTab === "pgsql"
                        ? "border-b-2 border-amber-500 text-amber-500"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    PostgreSQL
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideDbTab("sqlite")}
                    className={`pb-1.5 transition ${
                      guideDbTab === "sqlite"
                        ? "border-b-2 border-amber-500 text-amber-500"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    SQLite
                  </button>
                </div>

                {/* MySQL Guide */}
                {guideDbTab === "mysql" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white font-black">
                          1
                        </span>
                        <span>Create MySQL Backup User</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Run the following SQL commands on your MySQL server to create a dedicated backup user:
                      </p>
                      <div className="relative bg-slate-950 p-3.5 rounded-xl font-mono text-[10px] text-slate-300 overflow-x-auto select-all">
                        <span className="text-slate-500"># Create dedicated backup user</span>
                        <br />
                        CREATE USER &apos;<span className="text-amber-400">clospol_backup</span>&apos;@&apos;
                        <span className="text-emerald-400">%</span>&apos; IDENTIFIED BY &apos;
                        <span className="text-amber-500">Your_Strong_Password</span>&apos;;
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white font-black">
                          2
                        </span>
                        <span>Grant Read-Only Privileges</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Grant the minimum permissions required to read table structure and stream records:
                      </p>
                      <div className="relative bg-slate-950 p-3.5 rounded-xl font-mono text-[10px] text-slate-300 overflow-x-auto select-all">
                        <span className="text-slate-500"># Grant SELECT, SHOW VIEW, and LOCK TABLES</span>
                        <br />
                        GRANT SELECT, SHOW VIEW, LOCK TABLES ON <span className="text-amber-400">your_database</span>.*
                        TO &apos;<span className="text-amber-400">clospol_backup</span>&apos;@&apos;%&apos;;
                        <br />
                        FLUSH PRIVILEGES;
                      </div>
                    </div>
                  </div>
                )}

                {/* PostgreSQL Guide */}
                {guideDbTab === "pgsql" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white font-black">
                          1
                        </span>
                        <span>Create Postgres Read-Only Role</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Run the following commands on PostgreSQL to create a non-superuser backup role:
                      </p>
                      <div className="relative bg-slate-950 p-3.5 rounded-xl font-mono text-[10px] text-slate-300 overflow-x-auto select-all">
                        <span className="text-slate-500"># Create login user</span>
                        <br />
                        CREATE ROLE <span className="text-amber-400">clospol_backup</span> WITH LOGIN PASSWORD &apos;
                        <span className="text-amber-500">Your_Strong_Password</span>&apos;;
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white font-black">
                          2
                        </span>
                        <span>Grant Read-Only Privileges</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Connect to the target database and grant SELECT privileges on all public schema tables:
                      </p>
                      <div className="relative bg-slate-950 p-3.5 rounded-xl font-mono text-[10px] text-slate-300 overflow-x-auto select-all">
                        <span className="text-slate-500"># Grant read-only access</span>
                        <br />
                        GRANT CONNECT ON DATABASE <span className="text-amber-400">your_database</span> TO clospol_backup;
                        <br />
                        GRANT USAGE ON SCHEMA public TO clospol_backup;
                        <br />
                        GRANT SELECT ON ALL TABLES IN SCHEMA public TO clospol_backup;
                      </div>
                    </div>
                  </div>
                )}

                {/* SQLite Guide */}
                {guideDbTab === "sqlite" && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-2">
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <i className="fa-solid fa-file-invoice text-amber-500 text-sm"></i>
                      <span>SQLite Backup Configuration</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                      SQLite is a file-based embedded database. It does not use host, port, username, or password
                      credentials.
                    </p>
                    <ul className="list-disc pl-5 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                      <li>
                        Ensure the path you input is the <strong>absolute file path</strong> of the database file on
                        the server (e.g.{" "}
                        <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-900 font-mono">
                          C:/laragon/www/project/database/database.sqlite
                        </code>
                        ).
                      </li>
                      <li>Verify that the server process has read access to the SQLite file.</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Features & Info */}
              <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800 grid gap-4 sm:grid-cols-3">
                <div className="space-y-1 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-[11px]">
                    <i className="fa-solid fa-cloud-arrow-up text-blue-500"></i>
                    <span>Upload Routing Policy</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Select the <span className="text-amber-500 font-bold">Dynamic</span> storage option to automatically
                    route and distribute database backups across all connected cloud accounts based on your active routing
                    rules.
                  </p>
                </div>
                <div className="space-y-1 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-[11px]">
                    <i className="fa-solid fa-clock text-amber-500"></i>
                    <span>Cron Scheduler & Presets</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Use quick presets (Hourly, Daily, Weekly) or write a custom Cron expression to schedule automatic
                    execution times precisely.
                  </p>
                </div>
                <div className="space-y-1 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-[11px]">
                    <i className="fa-solid fa-broom text-emerald-500"></i>
                    <span>Auto Retention (Pruning)</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Specify a storage retention limit (in days). The system automatically prunes older backups from cloud
                    accounts once the retention window expires to save quota.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3 w-full">
          {/* Left 2 Columns: Scheduled Backups List */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">
                  <i className="fa-solid fa-server mr-1.5 text-amber-500"></i> Configured Schedules
                </h2>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  Active automated backup pipelines with live execution reports
                </p>
              </div>

              <div className="space-y-3">
                {schedules.length === 0 && (
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 py-8 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl">
                    No database backup schedules configured yet. Use the panel on the right to register your first connection.
                  </p>
                )}

                {schedules.map((item) => (
                  <div
                    key={item.id}
                    className="border border-slate-200/60 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl font-bold flex items-center justify-center shrink-0 text-white shadow-md bg-gradient-to-tr from-amber-500 to-amber-600 shadow-amber-500/10">
                          <i className="fa-solid fa-database text-lg"></i>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="truncate font-black text-slate-800 dark:text-slate-200 text-sm">
                              {item.name}
                            </p>
                            <span className="rounded px-1.5 py-0.5 text-[8px] font-black uppercase text-white tracking-wider bg-amber-500">
                              {item.driver}
                            </span>

                            {/* Last Run Status Badge */}
                            {item.last_backup_status === "success" && (
                              <span className="rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                                Success
                              </span>
                            )}
                            {item.last_backup_status === "failed" && (
                              <span className="rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400">
                                Failed
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                            {item.driver === "sqlite"
                              ? `File: ${item.database}`
                              : `${item.host}:${item.port} → Database: ${item.database}`}
                          </p>
                          <p className="truncate text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                            Target Storage:{" "}
                            {item.connected_account
                              ? `${item.connected_account.display_name} (${item.connected_account.provider.replace(
                                  "_",
                                  " "
                                )})`
                              : "Dynamic (Upload Routing Policy)"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Backup trigger button */}
                        <button
                          onClick={() => triggerBackup(item.id)}
                          disabled={triggeringId === item.id}
                          className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-1.5 px-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700 transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {triggeringId !== item.id ? (
                            <>
                              <i className="fa-solid fa-play text-[10px]"></i> Backup Now
                            </>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <span className="animate-spin rounded-full h-3 w-3 border-2 border-slate-500 border-t-transparent"></span>{" "}
                              Running...
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => deleteSchedule(item.id)}
                          className="rounded-lg p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition"
                        >
                          <i className="fa-solid fa-trash-can text-sm"></i>
                        </button>
                      </div>
                    </div>

                    {/* Execution info & Logs */}
                    <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 font-semibold text-slate-600 dark:text-slate-400">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px]">
                        <span>
                          Schedule Cron:{" "}
                          <code className="font-mono text-slate-700 dark:text-slate-300 select-all">
                            {item.cron_expression}
                          </code>
                        </span>
                        <span>
                          Retention:{" "}
                          <span className="text-slate-700 dark:text-slate-300 font-extrabold">
                            {item.retention_days} days
                          </span>
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-900 mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px]">
                        <span>
                          Last Backup Run:{" "}
                          <span className="text-slate-700 dark:text-slate-300">
                            {item.last_backup_at ? formatDateTime(item.last_backup_at) : "Never run"}
                          </span>
                        </span>
                      </div>
                      {item.driver === "sqlite" &&
                        item.headers &&
                        Object.keys(item.headers).length > 0 && (
                          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-900 mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="text-slate-400 dark:text-slate-500">Headers:</span>
                            {Object.keys(item.headers).map((key) => (
                              <span
                                key={key}
                                className="inline-block bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono text-[9px]"
                              >
                                {key}
                              </span>
                            ))}
                          </div>
                        )}
                      {item.last_backup_status === "failed" && item.last_backup_error && (
                        <div className="pt-1.5 border-t border-red-500/10 mt-1 bg-red-500/5 text-red-600 dark:text-red-400 p-2 rounded-lg font-mono text-[9px] break-words">
                          Error: {item.last_backup_error}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Add Schedule Form */}
          <div className="space-y-6 min-w-0">
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Add Connection</h2>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                  Register and schedule a database backup
                </p>
              </div>

              <form onSubmit={saveSchedule} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Friendly Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="e.g. Production Database Backup"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Database Driver</label>
                  <select
                    value={form.driver}
                    onChange={(e) => handleDriverChange(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  >
                    <option value="mysql">MySQL</option>
                    <option value="pgsql">PostgreSQL</option>
                    <option value="sqlite">SQLite</option>
                  </select>
                </div>

                {/* SQLite Security Notice Alert */}
                {form.driver === "sqlite" && (
                  <div className="rounded-2xl border border-red-200/50 bg-red-500/5 dark:border-red-900/30 p-3.5 text-[10px] font-semibold text-red-600 dark:text-red-400 space-y-1">
                    <div className="flex items-center gap-1.5 font-black">
                      <i className="fa-solid fa-circle-exclamation text-red-500 text-xs"></i>
                      <span>SECURITY RESTRICTION: SQLite Path Rules</span>
                    </div>
                    <p className="leading-normal">
                      For security reasons, SQLite database files <strong>must</strong> reside within the application&apos;s
                      root directory. Path traversal or accessing files outside this directory is strictly blocked.
                      Files must end with{" "}
                      <code className="px-1.5 py-0.5 rounded bg-red-500/10 font-mono text-[9px] text-red-900 dark:text-red-300">
                        .sqlite
                      </code>
                      ,{" "}
                      <code className="px-1.5 py-0.5 rounded bg-red-500/10 font-mono text-[9px] text-red-900 dark:text-red-300">
                        .sqlite3
                      </code>
                      , or{" "}
                      <code className="px-1.5 py-0.5 rounded bg-red-500/10 font-mono text-[9px] text-red-900 dark:text-red-300">
                        .db
                      </code>
                      .
                    </p>
                  </div>
                )}

                {form.driver !== "sqlite" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Database Host</label>
                      <input
                        type="text"
                        value={form.host}
                        onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
                        required={form.driver !== "sqlite"}
                        placeholder="127.0.0.1"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Port</label>
                      <input
                        type="number"
                        value={form.port}
                        onChange={(e) => setForm((prev) => ({ ...prev, port: Number(e.target.value) }))}
                        required={form.driver !== "sqlite"}
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {form.driver === "sqlite" ? "SQLite File Path / URL" : "Database Name"}
                  </label>
                  <input
                    type="text"
                    value={form.database}
                    onChange={(e) => setForm((prev) => ({ ...prev, database: e.target.value }))}
                    required
                    placeholder={
                      form.driver === "sqlite"
                        ? "e.g. https://example.com/db.sqlite or dev.db"
                        : "my_db_name"
                    }
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Custom HTTP Request Headers for SQLite URL downloads */}
                {form.driver === "sqlite" && (
                  <div className="flex flex-col gap-1.5 bg-slate-50/50 dark:bg-slate-950/20 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        HTTP Headers (For Remote URLs)
                      </label>
                      <button
                        type="button"
                        onClick={addHeaderRow}
                        className="text-[9px] font-black text-amber-500 hover:text-amber-600 flex items-center gap-1"
                      >
                        <i className="fa-solid fa-plus text-[8px]"></i> Add Header
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-normal">
                      Provide custom headers (e.g.{" "}
                      <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-900 font-mono text-[8px] text-slate-800 dark:text-slate-300">
                        Authorization: Bearer [token]
                      </code>
                      ) if database is hosted behind auth.
                    </p>

                    <div className="flex gap-2 text-[9px] font-extrabold text-blue-500 dark:text-blue-400 mt-1 select-none">
                      <span className="text-slate-400 dark:text-slate-600 font-normal">Presets:</span>
                      <button
                        type="button"
                        onClick={() => addHeaderPreset("jwt")}
                        className="hover:text-blue-600 dark:hover:text-blue-300 transition"
                      >
                        + JWT Token (Bearer)
                      </button>
                      <span className="text-slate-200 dark:text-slate-800 font-normal">|</span>
                      <button
                        type="button"
                        onClick={() => addHeaderPreset("basic")}
                        className="hover:text-blue-600 dark:hover:text-blue-300 transition"
                      >
                        + Basic Auth
                      </button>
                    </div>

                    <div className="space-y-2 mt-1">
                      {headersList.map((hdr, idx) => (
                        <div key={idx} className="flex gap-1.5 items-center">
                          <input
                            type="text"
                            value={hdr.key}
                            onChange={(e) => updateHeaderRow(idx, "key", e.target.value)}
                            placeholder="Key (e.g. Authorization)"
                            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[10px] font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                          />
                          <input
                            type="text"
                            value={hdr.value}
                            onChange={(e) => updateHeaderRow(idx, "value", e.target.value)}
                            placeholder="Value (e.g. Bearer xyz)"
                            className="flex-[1.5] h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[10px] font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => removeHeaderRow(idx)}
                            className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 transition"
                          >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {form.driver !== "sqlite" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Username</label>
                      <input
                        type="text"
                        value={form.username}
                        onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                        required={form.driver !== "sqlite"}
                        placeholder="root"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Password</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="••••••••"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Target Cloud Storage</label>
                  <select
                    value={form.connectedAccountId}
                    onChange={(e) => setForm((prev) => ({ ...prev, connectedAccountId: e.target.value }))}
                    required
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                  >
                    <option value="routing_policy">Dynamic (Upload Routing Policy)</option>
                    {storageAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.displayName} ({acc.provider.replace("_", " ")})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Cron Schedule</label>
                      <select
                        onChange={(e) => applyCronPreset(e.target.value)}
                        defaultValue=""
                        className="text-[9px] font-extrabold text-blue-500 hover:text-blue-700 bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
                      >
                        <option value="" disabled>
                          Presets
                        </option>
                        <option value="0 * * * *">Hourly</option>
                        <option value="0 0 * * *">Daily</option>
                        <option value="0 0 * * 0">Weekly</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={form.cronExpression}
                      onChange={(e) => setForm((prev) => ({ ...prev, cronExpression: e.target.value }))}
                      required
                      placeholder="0 0 * * *"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Retention</label>
                    <input
                      type="number"
                      value={form.retentionDays}
                      onChange={(e) => setForm((prev) => ({ ...prev, retentionDays: Number(e.target.value) }))}
                      required
                      placeholder="7"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={testDbConnection}
                    disabled={testingConnection || loading}
                    className="flex-1 h-10 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl font-bold text-xs text-slate-700 dark:text-slate-300 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                  >
                    {!testingConnection ? (
                      <>
                        <i className="fa-solid fa-plug text-[10px]"></i> Test DSN
                      </>
                    ) : (
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-500 border-t-transparent"></span>
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={loading || testingConnection}
                    className="flex-[2] h-10 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs shadow-md shadow-amber-500/10 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                  >
                    {!loading ? (
                      "Add Backup Config"
                    ) : (
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
