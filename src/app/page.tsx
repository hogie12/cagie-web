"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { FullScreenSpinner } from "@/components/Spinner";

export default function RootPage() {
  const { user, loading, coupleId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!coupleId) router.replace("/pair");
    else router.replace("/home");
  }, [user, loading, coupleId, router]);

  return <FullScreenSpinner />;
}
