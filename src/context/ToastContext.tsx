"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastContextType {
  toast: (title: string, options?: { kind?: ToastKind; body?: string }) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONES = {
  success: "text-green-600",
  error: "text-destructive",
  info: "text-accent",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextType["toast"]>(
    (title, options) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, title, kind: options?.kind ?? "info", body: options?.body }]);
      setTimeout(() => dismiss(id), options?.kind === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed top-3 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.96 }}
                role={t.kind === "error" ? "alert" : "status"}
                className="pointer-events-auto w-full max-w-sm bg-card text-card-foreground border border-border shadow-lg rounded-2xl px-4 py-3 flex items-start gap-3"
              >
                <Icon size={20} className={`mt-0.5 shrink-0 ${TONES[t.kind]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t.title}</p>
                  {t.body && <p className="text-sm text-muted-foreground mt-0.5 break-words">{t.body}</p>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="p-1 -m-1 text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
