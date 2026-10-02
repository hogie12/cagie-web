"use client";

import { useEffect, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Extra buttons shown next to the close button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/** Bottom sheet on phones, centred dialog from md up. Closes on Escape and backdrop tap. */
export function Sheet({ open, onClose, title, actions, children }: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-4">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="relative w-full md:max-w-md bg-card text-card-foreground rounded-t-3xl md:rounded-3xl shadow-2xl border border-border max-h-[92dvh] flex flex-col"
          >
            <div className="md:hidden mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border" aria-hidden />
            <div className="flex items-center justify-between gap-2 px-5 pt-3 md:pt-5 pb-2">
              <h2 id={titleId} className="text-lg font-bold truncate">
                {title}
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                {actions}
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-2 rounded-full bg-muted hover:bg-border transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
