"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, doc, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { minutesToTime, timeToMinutes } from "@/lib/recurrence";
import type { CalendarEvent, EventOwner } from "@/lib/recurrence";

export type { CalendarEvent, EventException, EventOwner, RepeatType } from "@/lib/recurrence";

export interface StickyNote {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  createdBy: string;
  createdAt: unknown;
}

export interface DashboardData {
  greetings?: Record<string, { text: string; updatedAt: number }>;
  paps?: Record<string, { url: string; updatedAt: number }>;
}

interface CoupleDataContextType {
  /** Raw (unexpanded) events. Use expandRecurringEvents for a date range. */
  events: CalendarEvent[];
  notes: StickyNote[];
  dashboard: DashboardData | null;
  isLoading: boolean;
  error: string | null;
}

const CoupleDataContext = createContext<CoupleDataContextType>({
  events: [],
  notes: [],
  dashboard: null,
  isLoading: true,
  error: null,
});

export const useCoupleData = () => useContext(CoupleDataContext);

interface Snapshot {
  coupleId: string;
  rawEvents: { id: string; data: DocumentData }[] | null;
  notes: StickyNote[];
  dashboard: DashboardData | null;
  error: string | null;
}

/** Map a stored event to the viewer's perspective (me / partner / us). */
function toCalendarEvent(id: string, data: DocumentData, uid: string | undefined): CalendarEvent {
  let owner: EventOwner = data.owner || "us";
  if (data.ownerId) {
    if (data.ownerId === "us") owner = "us";
    else owner = data.ownerId === uid ? "me" : "partner";
  }

  const startTime: string = data.startTime || "12:00";
  // Backward compat: old events stored durationMinutes instead of endTime.
  let endTime: string | undefined = data.endTime;
  if (!endTime && data.durationMinutes) {
    endTime = minutesToTime(timeToMinutes(startTime) + data.durationMinutes);
  }

  return {
    ...(data as Omit<CalendarEvent, "id">),
    id,
    startTime,
    endTime: endTime || minutesToTime(timeToMinutes(startTime) + 60),
    owner,
  };
}

export const CoupleDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { coupleId, user } = useAuth();
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!coupleId) return;

    const update = (patch: Partial<Snapshot>) =>
      setSnap((prev) => {
        const base: Snapshot =
          prev && prev.coupleId === coupleId
            ? prev
            : { coupleId, rawEvents: null, notes: [], dashboard: null, error: null };
        return { ...base, ...patch };
      });
    const onError = (err: Error) => {
      console.error(err);
      update({ error: "Couldn't load your shared data. Check your connection." });
    };

    const unsubEvents = onSnapshot(
      collection(db, "couples", coupleId, "events"),
      (s) => update({ rawEvents: s.docs.map((d) => ({ id: d.id, data: d.data() })), error: null }),
      onError,
    );
    const unsubNotes = onSnapshot(
      collection(db, "couples", coupleId, "notes"),
      (s) => update({ notes: s.docs.map((d) => ({ ...d.data(), id: d.id }) as StickyNote) }),
      onError,
    );
    const unsubDashboard = onSnapshot(
      doc(db, "couples", coupleId, "dashboard", "main"),
      (d) => update({ dashboard: d.exists() ? (d.data() as DashboardData) : null }),
      onError,
    );

    return () => {
      unsubEvents();
      unsubNotes();
      unsubDashboard();
    };
  }, [coupleId]);

  const current = snap && snap.coupleId === coupleId ? snap : null;
  const uid = user?.uid;

  const events = useMemo(
    () => (current?.rawEvents ?? []).map(({ id, data }) => toCalendarEvent(id, data, uid)),
    [current?.rawEvents, uid],
  );

  const value = useMemo<CoupleDataContextType>(
    () => ({
      events,
      notes: current?.notes ?? [],
      dashboard: current?.dashboard ?? null,
      isLoading: !!coupleId && !current?.rawEvents && !current?.error,
      error: current?.error ?? null,
    }),
    [events, current, coupleId],
  );

  return <CoupleDataContext.Provider value={value}>{children}</CoupleDataContext.Provider>;
};
