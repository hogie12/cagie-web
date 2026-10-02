"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Calendar,
  Map,
  StickyNote,
  User as UserIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { onMessage } from "firebase/messaging";
import { CoupleDataProvider } from "@/context/CoupleDataContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { initializeMessaging } from "@/lib/firebase";
import { FullScreenSpinner } from "@/components/Spinner";
import { Avatar } from "@/components/Avatar";

const navItems = [
  { name: "Home", href: "/home", icon: Home },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Planner", href: "/planner", icon: Map },
  { name: "Notes", href: "/notes", icon: StickyNote },
  { name: "Profile", href: "/profile", icon: UserIcon },
];

/** Shows push messages that arrive while the app is open (the SW only handles background ones). */
function useForegroundMessages(enabled: boolean) {
  const { toast } = useToast();
  useEffect(() => {
    if (!enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    let unsubscribe = () => {};
    let cancelled = false;
    initializeMessaging().then((messaging) => {
      if (!messaging || cancelled) return;
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title;
        if (title) toast(title, { body: payload.notification?.body });
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, toast]);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, coupleId, userPhotoURL, userName } = useAuth();

  const ready = !loading && !!user && !!coupleId;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!coupleId) router.replace("/pair");
  }, [loading, user, coupleId, router]);

  useForegroundMessages(ready);

  if (!ready) return <FullScreenSpinner />;

  return (
    <CoupleDataProvider>
      <div className="h-[100dvh] w-full bg-background text-foreground overflow-hidden flex flex-col md:pl-20">
        <main className="flex-1 h-full w-full relative overflow-hidden flex flex-col">
          {children}
        </main>

        {/* Bottom Nav for Mobile */}
        <nav
          aria-label="Main"
          className="md:hidden fixed bottom-0 left-0 right-0 bg-gradient-to-r from-white/90 via-white/80 to-nav-bg/80 backdrop-blur-2xl rounded-t-[2rem] flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)] z-50 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] border-t border-white/60"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isProfile = item.name === "Profile";
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center justify-center w-[60px] h-[64px] my-1.5 rounded-2xl transition-all duration-300 ${isActive ? "bg-black/5" : "hover:bg-black/5"}`}
              >
                {isProfile ? (
                  <Avatar
                    url={userPhotoURL}
                    name={userName}
                    className={`w-7 h-7 rounded-full mb-0.5 text-[10px] ${isActive ? "ring-2 ring-nav-inactive" : ""}`}
                  />
                ) : (
                  <div className="relative mb-0.5 text-nav-inactive">
                    <item.icon
                      size={22}
                      className={isActive ? "opacity-100" : "opacity-80"}
                      fill={isActive ? "currentColor" : "none"}
                      strokeWidth={isActive ? 2 : 2.5}
                    />
                  </div>
                )}
                <span
                  className={`text-[10px] font-bold tracking-tight ${isActive ? "text-nav-inactive" : "text-nav-inactive/80"}`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar for Desktop */}
        <nav
          aria-label="Main"
          className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 bg-card border-r border-border flex-col items-center py-8 space-y-8 z-50"
        >
          <Link
            href="/profile"
            aria-label="Profile"
            className="hover:opacity-90 transition-opacity"
          >
            <Avatar url={userPhotoURL} name={userName} className="w-10 h-10 rounded-xl shadow-md" />
          </Link>
          <div className="flex-1 flex flex-col space-y-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-label={item.name}
                  aria-current={isActive ? "page" : undefined}
                  className="w-12 h-12 flex items-center justify-center rounded-xl relative group"
                  title={item.name}
                >
                  <Icon
                    size={24}
                    className={`transition-colors z-10 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary/70"}`}
                  />
                  {isActive && (
                    <motion.div
                      layoutId="desktop-nav-indicator"
                      className="absolute inset-0 bg-primary/10 rounded-xl"
                      initial={false}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </CoupleDataProvider>
  );
}
