"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, arrayUnion } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { motion } from "framer-motion";
import { Copy, CheckCircle2, ArrowRight, LogOut } from "lucide-react";

export default function PairPage() {
  const { user, coupleId, setCoupleId } = useAuth();
  const router = useRouter();
  
  const [inviteCode, setInviteCode] = useState("");
  const [partnerCode, setPartnerCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (coupleId) {
      router.push("/home");
      return;
    }

    const checkOrCreateCode = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        let code = userSnap.data()?.personalInviteCode;
        if (!code) {
          code = Math.floor(100000 + Math.random() * 900000).toString();
          await updateDoc(userRef, { personalInviteCode: code });
        }
        setInviteCode(code);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    checkOrCreateCode();
  }, [user, coupleId, router]);

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerCode || partnerCode.length !== 6) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    if (partnerCode === inviteCode) {
      setError("You cannot use your own code.");
      return;
    }

    setJoining(true);
    setError("");

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("personalInviteCode", "==", partnerCode));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("Invalid code. Partner not found.");
        setJoining(false);
        return;
      }

      const partnerDoc = querySnapshot.docs[0];
      const partnerData = partnerDoc.data();
      const partnerId = partnerDoc.id;

      let sharedCoupleId = partnerData.coupleId;

      if (!sharedCoupleId) {
        const newCoupleRef = doc(collection(db, "couples"));
        sharedCoupleId = newCoupleRef.id;

        await setDoc(newCoupleRef, {
          members: [partnerId, user?.uid],
          createdAt: new Date()
        });

        await updateDoc(doc(db, "users", partnerId), { coupleId: sharedCoupleId });
      } else {
        const coupleRef = doc(db, "couples", sharedCoupleId);
        await updateDoc(coupleRef, {
          members: arrayUnion(user?.uid)
        });
      }

      await updateDoc(doc(db, "users", user!.uid), { coupleId: sharedCoupleId });
      
      setCoupleId(sharedCoupleId);
      router.push("/home");
      
    } catch (err: any) {
      setError("Error pairing: " + err.message);
      setJoining(false);
    }
  };

  if (loading) return null;

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
            <div className="flex items-center justify-center space-x-4">
              <span className="text-4xl font-mono font-bold tracking-widest text-primary">
                {inviteCode}
              </span>
              <button 
                onClick={copyCode}
                className="p-2 bg-muted text-muted-foreground hover:text-foreground rounded-xl transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <CheckCircle2 className="text-green-500" size={24} /> : <Copy size={24} />}
              </button>
            </div>
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
            <div className="relative">
              <input
                type="text"
                placeholder="Enter 6-digit code"
                maxLength={6}
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-4 rounded-xl border border-border bg-card text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring transition-all uppercase"
                required
              />
            </div>
            
            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={joining || partnerCode.length !== 6}
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
