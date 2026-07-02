"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    
    // Auto-remove success/info after 4 seconds.
    // Important notifications (error/warning) persist until clicked.
    if (type === "success" || type === "info") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue = React.useMemo(() => ({
    toast: addToast,
    success: (msg: string) => addToast(msg, "success"),
    error: (msg: string) => addToast(msg, "error"),
    warn: (msg: string) => addToast(msg, "warning"),
    info: (msg: string) => addToast(msg, "info"),
  }), [addToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast Portal Container */}
      <div className="fixed top-5 right-5 z-[9999] space-y-3 max-w-sm w-full pointer-events-none font-sans">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-xl animate-in slide-in-from-right duration-300 ${
              t.type === "success"
                ? "bg-white dark:bg-slate-900 border-emerald-100 dark:border-emerald-950/60 text-slate-800 dark:text-slate-200"
                : t.type === "error"
                ? "bg-white dark:bg-slate-900 border-rose-100 dark:border-rose-950/60 text-slate-800 dark:text-slate-200"
                : t.type === "warning"
                ? "bg-white dark:bg-slate-900 border-amber-100 dark:border-amber-950/60 text-slate-800 dark:text-slate-200"
                : "bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-950/60 text-slate-800 dark:text-slate-200"
            }`}
          >
            {/* Icon */}
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
              t.type === "success"
                ? "bg-emerald-500/10 text-emerald-500"
                : t.type === "error"
                ? "bg-rose-500/10 text-rose-500"
                : t.type === "warning"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-blue-500/10 text-blue-500"
            }`}>
              {t.type === "success" && <i className="fa-solid fa-circle-check text-xs"></i>}
              {t.type === "error" && <i className="fa-solid fa-circle-exclamation text-xs"></i>}
              {t.type === "warning" && <i className="fa-solid fa-triangle-exclamation text-xs"></i>}
              {t.type === "info" && <i className="fa-solid fa-circle-info text-xs"></i>}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="text-xs font-black capitalize">
                {t.type === "success" ? "Sukses" : t.type === "error" ? "Error" : t.type}
              </h4>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
                {t.message}
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
            >
              <i className="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
