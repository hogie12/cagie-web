"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Loader2, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { db, functions } from "@/lib/firebase";
import { errorMessage } from "@/lib/errors";
import { formatRemaining, waMeLink } from "@/lib/waLink";

const getWhatsAppLinkCode = httpsCallable<void, { code: string; expiresAt: number }>(functions, "getWhatsAppLinkCode");
const unlinkWhatsApp = httpsCallable<void, { ok: boolean }>(functions, "unlinkWhatsApp");
const ASSISTANT_NUMBER = process.env.NEXT_PUBLIC_WA_ASSISTANT_NUMBER;

/** Link this account to a WhatsApp number so the assistant can read and change your schedule. */
export function WhatsAppLinkCard() {
  const { user, coupleId } = useAuth();
  const { toast } = useToast();
  const [linkedAt, setLinkedAt] = useState<number | null | undefined>(undefined);
  const [pending, setPending] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const waitingForLink = useRef(false);

  // whatsappLinkedAt is written only by Cloud Functions; listen so the card flips as soon as /link succeeds.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      const value = snap.get("whatsappLinkedAt");
      const linked = typeof value === "number" ? value : null;
      setLinkedAt(linked);
      if (linked && waitingForLink.current) {
        waitingForLink.current = false;
        setPending(null);
        toast("WhatsApp connected", { kind: "success" });
      }
    });
  }, [user, toast]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  if (!user || !coupleId) return null;

  const requestCode = async () => {
    setBusy(true);
    try {
      const { data } = await getWhatsAppLinkCode();
      waitingForLink.current = true;
      setPending(data);
      setNow(Date.now());
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await unlinkWhatsApp();
      toast("WhatsApp disconnected", { kind: "success" });
    } catch (err) {
      toast(errorMessage(err), { kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const remaining = pending ? pending.expiresAt - now : 0;
  const expired = !!pending && remaining <= 0;
  const openLink = pending ? waMeLink(ASSISTANT_NUMBER, pending.code) : "";

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle size={18} /> WhatsApp assistant
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {linkedAt
              ? `Connected since ${new Date(linkedAt).toLocaleDateString()}. You can ask it about your schedule.`
              : "See and change your schedule by chatting on WhatsApp."}
          </p>
        </div>
        {linkedAt === undefined ? (
          <Loader2 className="animate-spin text-gray-400" size={18} />
        ) : linkedAt ? (
          <button
            onClick={disconnect}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {busy ? "..." : "Disconnect"}
          </button>
        ) : (
          (!pending || expired) && (
            <button
              onClick={requestCode}
              disabled={busy}
              className="px-4 py-2 bg-primary/10 text-foreground font-medium rounded-xl hover:bg-primary/20 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? "..." : expired ? "New code" : "Connect"}
            </button>
          )
        )}
      </div>

      {pending && !linkedAt && (
        <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
          {expired ? (
            <p>This code has expired. Get a new one.</p>
          ) : (
            <>
              <p>
                Send <span className="font-mono font-bold text-gray-900">/link {pending.code}</span> to the assistant on
                WhatsApp within <span className="font-semibold">{formatRemaining(remaining)}</span>.
              </p>
              {openLink && (
                <a
                  href={openLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors"
                >
                  Open WhatsApp
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
