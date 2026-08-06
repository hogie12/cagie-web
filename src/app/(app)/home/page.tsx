"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCoupleData } from "@/context/CoupleDataContext";
import { db, storage } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  Heart,
  Upload,
  Calendar as CalendarIcon,
  StickyNote as StickyNoteIcon,
  Camera,
  Send,
} from "lucide-react";
import { format, isAfter, parseISO, startOfDay } from "date-fns";

const COLORS = [
  {
    id: "yellow",
    bg: "bg-[#fef08a]",
    border: "border-[#fde047]",
    text: "text-amber-900",
  },
  {
    id: "pink",
    bg: "bg-[#fbcfe8]",
    border: "border-[#f9a8d4]",
    text: "text-pink-900",
  },
  {
    id: "blue",
    bg: "bg-[#bfdbfe]",
    border: "border-[#93c5fd]",
    text: "text-blue-900",
  },
  {
    id: "green",
    bg: "bg-[#bbf7d0]",
    border: "border-[#86efac]",
    text: "text-green-900",
  },
  {
    id: "purple",
    bg: "bg-[#e9d5ff]",
    border: "border-[#d8b4fe]",
    text: "text-purple-900",
  },
];

export default function HomePage() {
  const { user, coupleId } = useAuth();
  const { events, notes, dashboard, isLoading } = useCoupleData();

  const [greetingInput, setGreetingInput] = useState("");
  const [isUploadingPap, setIsUploadingPap] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleUpdateGreeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!greetingInput.trim() || !coupleId || !user) return;

    await setDoc(
      doc(db, "couples", coupleId, "dashboard", "main"),
      {
        greeting: greetingInput.trim(),
        greetingBy: user.uid,
      },
      { merge: true },
    );
    setGreetingInput("");
  };

  const handlePapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !coupleId || !user) return;

    setIsUploadingPap(true);
    try {
      const storageRef = ref(storage, `couples/${coupleId}/pap_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      await setDoc(
        doc(db, "couples", coupleId, "dashboard", "main"),
        {
          papUrl: url,
          papBy: user.uid,
          papTimestamp: Date.now(),
        },
        { merge: true },
      );
    } catch (error) {
      console.error("Error uploading PAP:", error);
    } finally {
      setIsUploadingPap(false);
    }
  };

  const partnerGreeting =
    dashboard?.greetingBy !== user?.uid ? dashboard?.greeting : null;
  const isPapFromPartner = dashboard?.papBy && dashboard?.papBy !== user?.uid;

  // Filter future events
  const today = startOfDay(new Date());
  const upcomingEvents = events
    .filter((e) => {
      const eventDate = parseISO(e.dateStr);
      return (
        isAfter(eventDate, today) || eventDate.getTime() === today.getTime()
      );
    })
    .sort((a, b) => {
      if (a.dateStr === b.dateStr)
        return a.startTime.localeCompare(b.startTime);
      return a.dateStr.localeCompare(b.dateStr);
    })
    .slice(0, 3);

  // Recent notes
  const recentNotes = [...notes]
    .sort(
      (a, b) =>
        ((b.createdAt as any)?.toMillis?.() || 0) -
        ((a.createdAt as any)?.toMillis?.() || 0),
    )
    .slice(0, 2);

  return (
    <div className="h-full overflow-y-auto p-6 md:p-10 pb-[100px] md:pb-10 bg-gradient-to-br from-background to-rose-50/30">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header & Greeting */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">
            Good morning, {user?.displayName?.split(" ")[0]}! ✨
          </h1>

          {partnerGreeting ? (
            <div className="p-6 bg-pink-100/50 rounded-3xl border border-pink-200 shadow-sm relative overflow-hidden">
              <Heart className="absolute -right-4 -bottom-4 w-24 h-24 text-pink-200/50 rotate-12" />
              <p className="text-xl font-medium text-pink-900 relative z-10">
                &quot;{partnerGreeting}&quot;
              </p>
              <p className="text-sm text-pink-700 mt-2 relative z-10 font-medium">
                — From your partner 💖
              </p>
            </div>
          ) : (
            <div className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-sm text-slate-500 mb-3">
                Leave a cute greeting for your partner to wake up to!
              </p>
              <form onSubmit={handleUpdateGreeting} className="flex gap-2">
                <input
                  type="text"
                  placeholder="E.g., Have a great day at work! I love you! 🥰"
                  value={greetingInput}
                  onChange={(e) => setGreetingInput(e.target.value)}
                  className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                />
                <button
                  type="submit"
                  disabled={!greetingInput.trim()}
                  className="bg-primary text-white p-2.5 rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center aspect-square"
                >
                  <Send size={18} />
                </button>
              </form>
              {dashboard?.greetingBy === user?.uid && (
                <p className="text-xs text-green-600 mt-3 font-medium">
                  ✓ You left a greeting. Waiting for them to see it!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Daily PAP */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Camera className="text-primary" size={20} />
            <h2 className="text-xl font-semibold">Daily Pipipip</h2>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4">
            {dashboard?.papUrl ? (
              <div className="relative aspect-square md:aspect-video rounded-3xl overflow-hidden group">
                <img
                  src={dashboard?.papUrl}
                  alt="Daily PAP"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                  <p className="text-white font-medium">
                    {isPapFromPartner
                      ? "Uploaded by your partner 📸"
                      : "Uploaded by you 📸"}
                  </p>
                </div>

                {/* Allow replacing the PAP */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-4 right-4 bg-white/90 backdrop-blur text-slate-800 p-2.5 rounded-full hover:bg-white transition-all shadow-sm"
                  title="Upload new PAP"
                >
                  <Camera size={18} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="aspect-video md:aspect-[21/9] bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all group"
              >
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="text-primary" size={24} />
                </div>
                <p className="font-medium text-slate-700">
                  Send a Daily Pipipip!
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Tap to snap or upload a photo
                </p>
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handlePapUpload}
              disabled={isUploadingPap}
            />

            {isUploadingPap && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                Uploading...
              </div>
            )}
          </div>
        </section>

        {/* Up Next & Recent Notes Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Up Next */}
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-5">
              <CalendarIcon className="text-blue-500" size={20} />
              <h2 className="font-semibold">Up Next</h2>
            </div>

            <div className="flex-1 space-y-3">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event) => {
                  const eventDate = parseISO(event.dateStr);
                  const isToday = eventDate.getTime() === today.getTime();
                  return (
                    <div
                      key={event.id}
                      className="flex gap-4 items-center p-3 rounded-2xl hover:bg-slate-50 transition-colors"
                    >
                      <div className="bg-blue-50 text-blue-600 w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0">
                        <span className="text-xs font-bold uppercase">
                          {format(eventDate, "MMM")}
                        </span>
                        <span className="text-lg font-black leading-none">
                          {format(eventDate, "d")}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold truncate">
                          {event.title}
                        </h4>
                        <p className="text-sm text-slate-500 truncate">
                          {isToday ? "Today" : format(eventDate, "EEEE")} •{" "}
                          {event.startTime}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-6">
                  <CalendarIcon size={32} className="mb-2 opacity-20" />
                  <p className="text-sm">No upcoming plans yet</p>
                </div>
              )}
            </div>
          </section>

          {/* Recent Notes */}
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-5">
              <StickyNoteIcon className="text-yellow-500" size={20} />
              <h2 className="font-semibold">Recent Notes</h2>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4">
              {recentNotes.length > 0 ? (
                recentNotes.map((note) => {
                  const colorTheme =
                    COLORS.find((c) => c.id === note.color) || COLORS[0];
                  return (
                    <div
                      key={note.id}
                      className={`aspect-square ${colorTheme.bg} border ${colorTheme.border} p-4 rounded-bl-3xl rounded-tr-lg rounded-tl-lg rounded-br-lg flex flex-col relative group hover:-translate-y-1 hover:rotate-2 transition-transform cursor-default`}
                      style={{
                        boxShadow:
                          "2px 4px 16px rgba(0,0,0,0.1), inset 0 0 40px rgba(0,0,0,0.02)",
                      }}
                    >
                      {/* Cute tape effect */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-3 bg-white/40 backdrop-blur-sm rounded-b-md -rotate-2 shadow-sm z-10" />

                      <div
                        className={`flex-1 text-sm font-medium whitespace-pre-wrap ${colorTheme.text} leading-relaxed mt-2 line-clamp-4`}
                      >
                        {note.text}
                      </div>

                      {/* Fold effect on bottom left */}
                      <div
                        className={`absolute bottom-0 left-0 w-8 h-8 bg-black/10 rounded-tr-2xl rounded-bl-3xl pointer-events-none`}
                      />
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 h-full flex flex-col items-center justify-center text-slate-400 py-6">
                  <StickyNoteIcon size={32} className="mb-2 opacity-20" />
                  <p className="text-sm">No recent notes</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
