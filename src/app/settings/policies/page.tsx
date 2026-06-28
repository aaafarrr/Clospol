"use client";

import React, { useState, useEffect } from "react";
import SidebarLayout from "@/components/layout/sidebar";

interface ConnectedAccount {
  id: string;
  provider: string;
  displayName: string;
  email: string;
}

interface AutoTieringRule {
  id: string;
  name: string;
  sourceAccountId: string;
  targetAccountId: string;
  ruleConditions: {
    daysOlderThan: number;
  };
  ruleAction: string;
  status: string;
}

export default function RoutingPoliciesPage() {
  const [loading, setLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Storage Accounts & Policy State
  const [allAccounts, setAllAccounts] = useState<ConnectedAccount[]>([]);
  const [policy, setPolicy] = useState({
    id: "",
    mode: "most_available",
    priorityAccountIds: [] as string[],
    saving: false,
  });

  // Auto-Tiering Rules State
  const [tieringRules, setTieringRules] = useState<AutoTieringRule[]>([]);
  const [tieringForm, setTieringForm] = useState({
    name: "",
    sourceAccountId: "",
    targetAccountId: "",
    daysOlderThan: 30,
    loading: false,
  });

  const loadData = async () => {
    try {
      // 1. Fetch connected accounts
      const accountsRes = await fetch("/api/storages");
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAllAccounts(accountsData.accounts || []);
      }

      // 2. Fetch routing policy
      const policyRes = await fetch("/api/storage/routing-policy");
      if (policyRes.ok) {
        const policyData = await policyRes.json();
        if (policyData.policy) {
          setPolicy({
            id: policyData.policy.id,
            mode: policyData.policy.mode,
            priorityAccountIds: policyData.policy.priorityAccountIds || [],
            saving: false,
          });
        }
      }

      // 3. Fetch auto tiering rules
      const tieringRes = await fetch("/api/settings/auto-tiering");
      if (tieringRes.ok) {
        const tieringData = await tieringRes.json();
        setTieringRules(tieringData.rules || []);
      }
    } catch (err) {
      console.error("Failed to load routing policies:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveRoutingPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setPolicy((prev) => ({ ...prev, saving: true }));
    try {
      const orderedIds = getOrderedAccounts().map((acc) => acc.id);
      const res = await fetch("/api/storage/routing-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: policy.mode,
          priorityAccountIds: orderedIds,
        }),
      });
      if (res.ok) {
        setAlertMessage("Upload routing policy updated successfully.");
        loadData();
      } else {
        alert("Failed to save routing policy.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPolicy((prev) => ({ ...prev, saving: false }));
    }
  };

  const getOrderedAccounts = () => {
    const orderMap = new Map(policy.priorityAccountIds.map((id, idx) => [id, idx]));
    return [...allAccounts].sort((a, b) => {
      const aIdx = orderMap.get(a.id);
      const bIdx = orderMap.get(b.id);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return 0;
    });
  };

  const moveAccount = (index: number, direction: number) => {
    const ordered = getOrderedAccounts();
    if (index + direction < 0 || index + direction >= ordered.length) return;

    const temp = ordered[index];
    ordered[index] = ordered[index + direction];
    ordered[index + direction] = temp;

    setPolicy((prev) => ({
      ...prev,
      priorityAccountIds: ordered.map((acc) => acc.id),
    }));
  };

  const saveAutoTieringRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tieringForm.targetAccountId) {
      alert("Target storage destination is required.");
      return;
    }
    setTieringForm((prev) => ({ ...prev, loading: true }));
    try {
      const ruleName = tieringForm.name || "Migration Rule";
      const res = await fetch("/api/settings/auto-tiering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName,
          sourceAccountId: tieringForm.sourceAccountId || "",
          targetAccountId: tieringForm.targetAccountId,
          daysOlderThan: tieringForm.daysOlderThan,
          ruleAction: "migrate",
        }),
      });
      if (res.ok) {
        setAlertMessage("Auto-tiering rule created successfully.");
        setTieringForm({
          name: "",
          sourceAccountId: "",
          targetAccountId: "",
          daysOlderThan: 30,
          loading: false,
        });
        loadData();
      } else {
        alert("Failed to create tiering rule.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTieringForm((prev) => ({ ...prev, loading: false }));
    }
  };

  const toggleAutoTieringRule = async (rule: AutoTieringRule) => {
    try {
      const res = await fetch(`/api/settings/auto-tiering/${rule.id}/toggle`, {
        method: "PATCH",
      });
      if (res.ok) {
        loadData();
      } else {
        alert("Failed to toggle rule.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteAutoTieringRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this auto-tiering rule?")) return;
    try {
      const res = await fetch(`/api/settings/auto-tiering/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertMessage("Rule deleted successfully.");
        loadData();
      } else {
        alert("Failed to delete rule.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const orderedAccounts = getOrderedAccounts();

  return (
    <SidebarLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Routing Policies</h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
            Configure target selection algorithms and schedule automated migration plans for older documents
          </p>
        </div>

        {/* Alert Banner */}
        {alertMessage && (
          <div className="rounded-2xl bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/50 p-4 text-sm font-bold text-blue-700 dark:text-blue-400 flex items-center justify-between animate-in fade-in duration-200">
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
          <div className="grid gap-6 md:grid-cols-2 w-full">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-96 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 shadow-sm animate-pulse space-y-4"
              >
                <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-4 w-60 bg-slate-100 dark:bg-slate-800 rounded"></div>
                <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 w-full animate-in fade-in duration-200">
            {/* Upload Routing Card */}
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5 flex flex-col justify-between min-w-0">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-shuffle text-blue-500"></i> Upload Routing Policy
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Select distribution mode algorithm for outgoing file uploads
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
                    Mode Explanations:
                  </span>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong>Most Available:</strong> Automatically directs uploads to the storage account containing the largest free byte quota.</li>
                    <li><strong>Round Robin:</strong> Cycles through each connected storage account sequentially.</li>
                    <li><strong>Priority Sequence:</strong> Selects the first account in the priority list that has enough free storage space.</li>
                  </ul>
                </div>

                <form onSubmit={saveRoutingPolicy} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Distribution Mode</label>
                    <select
                      value={policy.mode}
                      onChange={(e) => setPolicy(prev => ({ ...prev, mode: e.target.value }))}
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-semibold transition bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                    >
                      <option value="most_available">Most Available (Largest free storage first)</option>
                      <option value="round_robin">Round Robin (Distribute sequentially)</option>
                      <option value="priority">Priority Sequence (In priority sequence order)</option>
                      <option value="local_first">Local Storage First (Prioritize physical directories)</option>
                      <option value="cloud_first">Cloud Storage First (Prioritize Google/S3/OneDrive/Dropbox drives)</option>
                      <option value="least_available">Least Available Space (Fill up smaller storages first)</option>
                      <option value="random">Random Selection (Randomly pick eligible storages)</option>
                    </select>
                  </div>

                  {/* Priority Order Listing */}
                  {(policy.mode === 'priority' || policy.mode === 'round_robin') && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Routing Account Priority Order</label>
                      <div className="space-y-2 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl bg-slate-50/20 dark:bg-slate-950/20">
                        {orderedAccounts.map((account, index) => (
                          <div
                            key={account.id}
                            className="bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 shadow-sm"
                          >
                            <span>{index + 1}. {account.displayName || account.email} ({account.provider.replace('_', ' ')})</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveAccount(index, -1)}
                                disabled={index === 0}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 disabled:opacity-30 transition cursor-pointer"
                              >
                                <i className="fa-solid fa-chevron-up text-xs"></i>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveAccount(index, 1)}
                                disabled={index === orderedAccounts.length - 1}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 disabled:opacity-30 transition cursor-pointer"
                              >
                                <i className="fa-solid fa-chevron-down text-xs"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={policy.saving}
                    className="w-full h-11 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-800 text-white rounded-xl font-bold text-sm shadow-md disabled:opacity-50 transition flex items-center justify-center cursor-pointer"
                  >
                    {!policy.saving ? (
                      <span>Save Routing Policy</span>
                    ) : (
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Auto-Tiering Card */}
            <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-sm space-y-5 flex flex-col justify-between min-w-0">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <i className="fa-solid fa-server text-blue-500"></i> Auto-Tiering Storage Rules
                  </h2>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">
                    Migrate older files automatically to cold archive destinations
                  </p>
                </div>

                {/* Add rule sub-form */}
                <form onSubmit={saveAutoTieringRule} className="p-4 rounded-2xl bg-slate-50/30 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">Add Automation Rule</h3>

                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Source Storage</label>
                      <select
                        value={tieringForm.sourceAccountId}
                        onChange={(e) => setTieringForm({ ...tieringForm, sourceAccountId: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      >
                        <option value="">All Accounts (Any Source)</option>
                        {allAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.displayName || acc.email} ({acc.provider.replace('_', ' ')})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Target Storage (Archive)</label>
                      <select
                        value={tieringForm.targetAccountId}
                        onChange={(e) => setTieringForm({ ...tieringForm, targetAccountId: e.target.value })}
                        required
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      >
                        <option value="" disabled>Select Destination Account</option>
                        {allAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.displayName || acc.email} ({acc.provider.replace('_', ' ')})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1 flex-1 text-xs">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Age Threshold (Days Old)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={tieringForm.daysOlderThan}
                        onChange={(e) => setTieringForm({ ...tieringForm, daysOlderThan: parseInt(e.target.value) || 30 })}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={tieringForm.loading}
                      className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-md shadow-blue-500/10 transition mt-4 shrink-0 cursor-pointer"
                    >
                      {!tieringForm.loading ? (
                        <span>Create Rule</span>
                      ) : (
                        <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>
                      )}
                    </button>
                  </div>
                </form>

                {/* Rules List */}
                <div className="space-y-2">
                  {tieringRules.length === 0 ? (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-6 text-center bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl">
                      No automated tiering rules configured.
                    </p>
                  ) : (
                    tieringRules.map((rule) => {
                      const sourceAcc = allAccounts.find((a) => a.id === rule.sourceAccountId);
                      const targetAcc = allAccounts.find((a) => a.id === rule.targetAccountId);
                      return (
                        <div
                          key={rule.id}
                          className="border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 rounded-xl p-3 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-extrabold text-[9px] uppercase tracking-wide">
                                &gt;{rule.ruleConditions?.daysOlderThan} Days
                              </span>
                              <span className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">
                                {rule.status}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
                              <span className="truncate max-w-[8rem] text-slate-700 dark:text-slate-200">{sourceAcc ? sourceAcc.displayName : "All Accounts"}</span>
                              <i className="fa-solid fa-arrow-right text-[9px]"></i>
                              <span className="truncate max-w-[8rem] text-slate-700 dark:text-slate-200">{targetAcc ? targetAcc.displayName : "Target"}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleAutoTieringRule(rule)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out ${
                                rule.status === 'active' ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                                  rule.status === 'active' ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              ></span>
                            </button>
                            <button
                              onClick={() => deleteAutoTieringRule(rule.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition cursor-pointer"
                            >
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        </div>
                      );
                    })
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
