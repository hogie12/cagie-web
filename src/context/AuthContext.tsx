"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  coupleId: string | null;
  setCoupleId: (id: string | null) => void;
  userName: string | null;
  partnerName: string | null;
  userPhotoURL: string | null;
  partnerPhotoURL: string | null;
  partnerId: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  coupleId: null,
  setCoupleId: () => {},
  userName: null,
  partnerName: null,
  userPhotoURL: null,
  partnerPhotoURL: null,
  partnerId: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [partnerPhotoURL, setPartnerPhotoURL] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Cek apakah user sudah punya data profile & coupleId di Firestore
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        let cId = null;

        if (userDoc.exists()) {
          const data = userDoc.data();
          cId = data.coupleId || null;
          setCoupleId(cId);
          setUserName(data.name || null);
          setUserPhotoURL(data.photoURL || null);
        } else {
          // Jika belum ada profile, buat kosong (meskipun seharusnya sudah dibuat di register)
          await setDoc(userDocRef, {
            email: currentUser.email,
            name: "",
            photoURL: null,
            coupleId: null,
            createdAt: new Date(),
          });
          setCoupleId(null);
          setUserName(null);
          setUserPhotoURL(null);
        }

        // Fetch partner name if paired
        if (cId) {
          const coupleDocRef = doc(db, "couples", cId);
          const coupleDoc = await getDoc(coupleDocRef);
          if (coupleDoc.exists()) {
            const members = coupleDoc.data().members || [];
            const pId = members.find((id: string) => id !== currentUser.uid);
            if (pId) {
              setPartnerId(pId);
              const partnerDoc = await getDoc(doc(db, "users", pId));
              if (partnerDoc.exists()) {
                const pData = partnerDoc.data();
                setPartnerName(pData.name || null);
                setPartnerPhotoURL(pData.photoURL || null);
              }
            }
          }
        } else {
          setPartnerId(null);
          setPartnerName(null);
          setPartnerPhotoURL(null);
        }

      } else {
        setCoupleId(null);
        setUserName(null);
        setUserPhotoURL(null);
        setPartnerId(null);
        setPartnerName(null);
        setPartnerPhotoURL(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, coupleId, setCoupleId, userName, partnerName, userPhotoURL, partnerPhotoURL, partnerId }}>
      {children}
    </AuthContext.Provider>
  );
};
