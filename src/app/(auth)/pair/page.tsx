"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { motion } from "framer-motion";
import { Copy, CheckCircle2, ArrowRight, LogOut, Share2, RefreshCw } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { FullScreenSpinner } from "@/components/Spinner";

const CODE_LENGTH = 6;

const getInviteCode = httpsCallable<void, { code: string | null; paired: boolean }>(
  functions,
  "getInviteCode",
);
const pairWithCode = httpsCallable<{ code: string }, { coupleId: string }>(
  functions,
  "pairWithCode",
);

export default function PairPage() {
  const { user, loading: authLoading, coupleId, logout } = useAuth();
  const router = useRouter();

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const uid = user?.uid;

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
    else if (coupleId) router.replace("/home");
  }, [authLoading, user, coupleId, router]);

  useEffect(() => {
    if (authLoading || !uid || coupleId) return;
    let cancelled = false;
    getInviteCode()
      .then((res) => {
        if (cancelled) return;
        setInviteCode(res.data.code);
        setCodeError("");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setCodeError(errorMessage(err, "Couldn't load your invite code."));
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, uid, coupleId, reloadKey]);

  const copyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the code is still visible.
    }
  };

  const shareCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.share({
        title: "Join me on Cagie 💕",
        text: `Pair with me on Cagie! My code is ${inviteCode}`,
        url: window.location.origin,
      });
    } catch {
      // User cancelled the share sheet.
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = partnerCode.trim().toUpperCase();
    if (code.length !== CODE_LENGTH) {
      setError(`Please enter the ${CODE_LENGTH}-character code.`);
      return;
    }
    if (code === inviteCode) {
      setError("That's your own code — share it with your partner instead.");
      return;
    }

    setJoining(true);
    setError("");
    try {
      await pairWithCode({ code });
      // AuthContext picks up the new coupleId from the profile snapshot and the
      // effect above redirects to /home.
    } catch (err) {
      setError(errorMessage(err, "Couldn't pair. Please try again."));
      setJoining(false);
    }
  };

  if (authLoading || !user || coupleId) return <FullScreenSpinner />;

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <button
        onClick={handleLogout}
        className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted backdrop-blur-sm rounded-full text-sm font-medium text-destructive transition-colors z-20 shadow-sm"
      >
        <LogOut size={16} /> Logout
      </button>

      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-secondary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass p-8 rounded-3xl text-center space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Find Your Partner</h1>
            <p className="text-muted-foreground text-sm">
              Share your code with your partner, or enter their code below to connect your accounts.
            </p>
          </div>

          <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-3">YOUR INVITE CODE</p>
            {codeError ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{codeError}</p>
                <button
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-xl text-sm font-medium hover:bg-border transition-colors"
                >
                  <RefreshCw size={16} /> Try again
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <span
                  className="text-4xl font-mono font-bold tracking-widest text-foreground min-w-[9ch]"
                  aria-live="polite"
                >
                  {inviteCode ?? "······"}
                </span>
                <button
                  onClick={copyCode}
                  disabled={!inviteCode}
                  className="p-2 bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors disabled:opacity-50"
                  aria-label="Copy code"
                  title="Copy to clipboard"
                >
                  {copied ? <CheckCircle2 className="text-green-500" size={24} /> : <Copy size={24} />}
                </button>
                {canShare && (
                  <button
                    onClick={shareCode}
                    disabled={!inviteCode}
                    className="p-2 bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors disabled:opacity-50"
                    aria-label="Share code"
                    title="Share"
                  >
                    <Share2 size={24} />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">Codes expire after 7 days.</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background text-muted-foreground rounded-full">OR ENTER CODE</span>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label="Partner's code"
              placeholder="Partner's code"
              maxLength={CODE_LENGTH}
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="w-full px-4 py-4 rounded-xl border border-border bg-card text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring transition-all placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
              required
            />

            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

            <button
              type="submit"
              disabled={joining || partnerCode.length !== CODE_LENGTH}
              className="w-full py-4 px-4 bg-foreground text-background rounded-xl font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {joining ? "Connecting..." : "Connect Accounts"}
              {!joining && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
