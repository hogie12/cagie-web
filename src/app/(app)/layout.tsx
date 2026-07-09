"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Map, StickyNote, User as UserIcon } from "lucide-react";
import { motion } from "framer-motion";
import { CoupleDataProvider } from "@/context/CoupleDataContext";
import { useAuth } from "@/context/AuthContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userPhotoURL, userName } = useAuth();

  const navItems = [
    { name: "Home", href: "/home", icon: Home },
    { name: "Calendar", href: "/calendar", icon: Calendar },
    { name: "Planner", href: "/planner", icon: Map },
    { name: "Notes", href: "/notes", icon: StickyNote },
    { name: "Profile", href: "/profile", icon: UserIcon },
  ];

  return (
    <CoupleDataProvider>
      <div className="min-h-screen bg-background text-foreground pb-20">
        {children}
        
        {/* Bottom Nav for Mobile */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 h-[76px] bg-gradient-to-r from-white/80 via-white/70 to-nav-bg/60 backdrop-blur-xl rounded-[2.5rem] flex items-center justify-around px-2 z-50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] border border-white/60">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const isProfile = item.name === "Profile";
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`flex flex-col items-center justify-center w-[60px] h-[64px] rounded-2xl transition-all duration-300 ${isActive ? 'bg-black/5' : 'hover:bg-black/5'}`}
            >
              {isProfile ? (
                <div className={`w-7 h-7 rounded-full overflow-hidden flex items-center justify-center mb-0.5 ${isActive ? 'ring-2 ring-nav-inactive' : ''}`}>
                  {userPhotoURL ? (
                    <img src={userPhotoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                      {(userName?.[0] || "U").toUpperCase()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative mb-0.5 text-nav-inactive">
                  <item.icon 
                    size={22} 
                    className={isActive ? 'opacity-100' : 'opacity-80'} 
                    fill={isActive ? "currentColor" : "none"}
                    strokeWidth={isActive ? 2 : 2.5}
                  />
                  {isActive && item.name === "Home" && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
                  )}
                </div>
              )}
              <span className={`text-[10px] font-bold tracking-tight ${isActive ? 'text-nav-inactive' : 'text-nav-inactive/80'}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>

        {/* Sidebar for Desktop */}
        <div className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 bg-card border-r border-border flex-col items-center py-8 space-y-8 z-50">
          <Link href="/profile" className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold shadow-md overflow-hidden hover:opacity-90 transition-opacity">
            {userPhotoURL ? (
              <img src={userPhotoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              (userName?.[0] || "C").toUpperCase()
            )}
          </Link>
          <div className="flex-1 flex flex-col space-y-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              
              return (
                <Link 
                  key={item.name} 
                  href={item.href}
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
        <div className="flex-1" />
      </div>
        
        {/* Adjust margin for desktop sidebar */}
        <style jsx global>{`
          @media (min-width: 768px) {
            body { padding-left: 5rem; }
          }
        `}</style>
      </div>
    </CoupleDataProvider>
  );
}
