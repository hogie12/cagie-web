"use client";

import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Home</h1>
      <p>Halo, {user?.displayName}</p>
      <p className="mt-4 text-muted-foreground">
        Masih dalam proses development yaa beb!!
      </p>
    </div>
  );
}
