"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db, initializeMessaging } from "@/lib/firebase";
import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getToken } from "firebase/messaging";

// The VAPID key is public; the env var lets other Firebase projects override it.
const VAPID_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ||
  "BH3y98ZQc84XqQwho2T98ZDRstqT5kaPHqYVhmqKaOc0RxNQAgTYhdlbJjGLbK4755Ysgd0kRprPHzW0WI3VZDQ";

export type NotificationStatus = "granted" | "denied" | "default" | "unsupported";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  coupleId: string | null;
  userName: string | null;
  partnerName: string | null;
  userPhotoURL: string | null;
  partnerPhotoURL: string | null;
  partnerId: string | null;
  requestNotificationPermission: () => Promise<NotificationStatus>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  coupleId: null,
  userName: null,
  partnerName: null,
  userPhotoURL: null,
  partnerPhotoURL: null,
  partnerId: null,
  requestNotificationPermission: async () => "unsupported",
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

interface ProfileState {
  uid: string;
  name: string | null;
  photoURL: string | null;
  coupleId: string | null;
}

interface PartnerState {
  coupleId: string;
  id: string | null;
  name: string | null;
  photoURL: string | null;
}

/** Create the user profile document once, if it doesn't exist yet. */
async function ensureProfile(user: User) {
  const ref = doc(db, "users", user.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    tx.set(ref, {
      email: user.email,
      name: user.displayName || "",
      photoURL: null,
      coupleId: null,
      createdAt: serverTimestamp(),
    });
  });
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authState, setAuthState] = useState<{ user: User | null; ready: boolean }>({
    user: null,
    ready: false,
  });
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [partner, setPartner] = useState<PartnerState | null>(null);

  const user = authState.user;
  const uid = user?.uid ?? null;

  useEffect(() => onAuthStateChanged(auth, (u) => setAuthState({ user: u, ready: true })), []);

  // Live profile: name / photo / coupleId changes show up everywhere immediately.
  useEffect(() => {
    if (!user) return;
    const empty: ProfileState = { uid: user.uid, name: null, photoURL: null, coupleId: null };
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        if (!snap.exists()) {
          ensureProfile(user).catch((err) => {
            console.error("Error creating profile:", err);
            setProfile(empty);
          });
          return;
        }
        const data = snap.data();
        setProfile({
          uid: user.uid,
          name: data.name || null,
          photoURL: data.photoURL || null,
          coupleId: data.coupleId || null,
        });
      },
      (err) => {
        console.error("Error loading profile:", err);
        setProfile(empty);
      },
    );
  }, [user]);

  const currentProfile = profile && profile.uid === uid ? profile : null;
  const coupleId = currentProfile?.coupleId ?? null;

  // Partner profile, live.
  useEffect(() => {
    if (!uid || !coupleId) return;
    let cancelled = false;
    let unsubPartner = () => {};
    const none = { coupleId, id: null, name: null, photoURL: null };

    getDoc(doc(db, "couples", coupleId))
      .then((coupleSnap) => {
        if (cancelled) return;
        const members: string[] = coupleSnap.data()?.members || [];
        const pId = members.find((id) => id !== uid);
        if (!pId) {
          setPartner(none);
          return;
        }
        unsubPartner = onSnapshot(
          doc(db, "users", pId),
          (s) =>
            setPartner({
              coupleId,
              id: pId,
              name: s.data()?.name || null,
              photoURL: s.data()?.photoURL || null,
            }),
          (err) => {
            console.error("Error loading partner:", err);
            setPartner({ ...none, id: pId });
          },
        );
      })
      .catch((err) => {
        console.error("Error loading couple:", err);
        if (!cancelled) setPartner(none);
      });

    return () => {
      cancelled = true;
      unsubPartner();
    };
  }, [uid, coupleId]);

  const currentPartner = partner && coupleId && partner.coupleId === coupleId ? partner : null;

  const loading =
    !authState.ready || (!!user && !currentProfile) || (!!coupleId && !currentPartner);

  const requestNotificationPermission = useCallback(async (): Promise<NotificationStatus> => {
    if (!uid) throw new Error("Please sign in first.");
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    const messaging = await initializeMessaging();
    if (!messaging) return "unsupported";

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) throw new Error("Couldn't get a notification token.");
    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    return "granted";
  }, [uid]);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      coupleId,
      userName: currentProfile?.name ?? null,
      userPhotoURL: currentProfile?.photoURL ?? null,
      partnerId: currentPartner?.id ?? null,
      partnerName: currentPartner?.name ?? null,
      partnerPhotoURL: currentPartner?.photoURL ?? null,
      requestNotificationPermission,
      logout,
    }),
    [user, loading, coupleId, currentProfile, currentPartner, requestNotificationPermission, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
