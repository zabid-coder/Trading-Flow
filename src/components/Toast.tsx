// src/components/Toast.tsx — Global Toast Notification Overlay
import React, { createContext, useCallback, useContext, useState } from "react";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: "success" | "warning" | "error" | "info" | "signal";
  timestamp: number;
}

interface ToastContextType {
  addToast: (toast: Omit<ToastMessage, "id" | "timestamp">) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      addToast: () => {},
    };
  }
  return ctx;
}

import { secureRandomId } from "../utils/crypto";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: Omit<ToastMessage, "id" | "timestamp">) => {
    const id = secureRandomId("toast");
    const newToast: ToastMessage = {
      ...toast,
      id,
      timestamp: Date.now(),
    };
    setToasts((prev) => [...prev.slice(-4), newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getBorderColor = (type: ToastMessage["type"]) => {
    switch (type) {
      case "success":
        return "rgba(47, 201, 143, 0.6)";
      case "warning":
      case "signal":
        return "rgba(232, 180, 76, 0.7)";
      case "error":
        return "rgba(240, 84, 108, 0.7)";
      default:
        return "rgba(110, 155, 216, 0.6)";
    }
  };

  const getIcon = (type: ToastMessage["type"]) => {
    switch (type) {
      case "success":
        return "✓";
      case "warning":
        return "⚠️";
      case "signal":
        return "⚡";
      case "error":
        return "✕";
      default:
        return "ℹ️";
    }
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast Overlay Container */}
      <div className="fixed top-14 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className="pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border backdrop-blur-md shadow-2xl transition-all animate-slide-in cursor-pointer font-mono text-[11px]"
            style={{
              borderColor: getBorderColor(t.type),
              background: "rgba(10, 16, 28, 0.95)",
              boxShadow: `0 8px 30px rgba(0,0,0,0.6), 0 0 15px ${getBorderColor(t.type)}`,
            }}
          >
            <div className="text-[13px] mt-0.5">{getIcon(t.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white tracking-wide">{t.title}</div>
              {t.description && (
                <div className="text-[10px] text-[var(--muted)] leading-snug mt-0.5">
                  {t.description}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              className="text-[var(--dim)] hover:text-white text-[10px] ml-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
