"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot, query, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { addDays, format, getDay, parse, differenceInCalendarDays } from "date-fns";

export type EventOwner = "me" | "partner" | "us";

export interface EventException {
  deleted?: boolean;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  owner?: EventOwner;
  ownerId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  dateStr: string; // YYYY-MM-DD for easier querying
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  owner: EventOwner;
  ownerId?: string; // UID of the user who created it
  categoryId?: string;
  description?: string;
  // Recurrence fields
  repeatType?: "none" | "daily" | "weekly";
  repeatDays?: number[]; // 0=Sun..6=Sat, only for weekly
  repeatUntil?: string; // YYYY-MM-DD inclusive end date
  exceptions?: Record<string, EventException>; // keyed by YYYY-MM-DD
  // Client-only fields (not stored in Firestore)
  isOccurrence?: boolean;
  originalEventId?: string;
  // Backward compat: old events may still have durationMinutes
  durationMinutes?: number;
}

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

/** Convert HH:mm to total minutes */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert durationMinutes to an endTime string for backward compat */
function computeEndTime(startTime: string, durationMinutes: number): string {
  const totalMins = timeToMinutes(startTime) + durationMinutes;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Expand recurring events into individual occurrence CalendarEvents.
 * Non-repeating events pass through unchanged.
 * Caps expansion to ±90 days from today for performance.
 */
function expandRecurringEvents(rawEvents: CalendarEvent[]): CalendarEvent[] {
  const result: CalendarEvent[] = [];
  const today = new Date();
  const windowStart = addDays(today, -90);
  const windowEnd = addDays(today, 90);
  const windowStartStr = format(windowStart, "yyyy-MM-dd");
  const windowEndStr = format(windowEnd, "yyyy-MM-dd");

  for (const event of rawEvents) {
    const repeatType = event.repeatType || "none";

    if (repeatType === "none" || !event.repeatUntil) {
      // Non-repeating event — pass through as-is
      result.push(event);
      continue;
    }

    // Determine the effective end date (capped to window)
    const effectiveEnd = event.repeatUntil < windowEndStr ? event.repeatUntil : windowEndStr;
    const effectiveStart = event.dateStr > windowStartStr ? event.dateStr : windowStartStr;

    if (effectiveStart > effectiveEnd) continue; // entirely outside window

    const startDate = parse(effectiveStart, "yyyy-MM-dd", new Date());
    const endDate = parse(effectiveEnd, "yyyy-MM-dd", new Date());
    const totalDays = differenceInCalendarDays(endDate, startDate);

    for (let i = 0; i <= totalDays; i++) {
      const current = addDays(startDate, i);
      const currentStr = format(current, "yyyy-MM-dd");

      // For weekly: check if this day of week is in repeatDays
      if (repeatType === "weekly" && event.repeatDays) {
        const dow = getDay(current); // 0=Sun..6=Sat
        if (!event.repeatDays.includes(dow)) continue;
      }

      // Check exceptions
      const exception = event.exceptions?.[currentStr];
      if (exception?.deleted) continue; // skip deleted occurrence

      // Build the occurrence event
      const occurrence: CalendarEvent = {
        ...event,
        dateStr: currentStr,
        isOccurrence: true,
        originalEventId: event.id,
        // Generate a unique ID for the occurrence
        id: `${event.id}_${currentStr}`,
      };

      // Apply exception overrides
      if (exception) {
        if (exception.title !== undefined) occurrence.title = exception.title;
        if (exception.description !== undefined) occurrence.description = exception.description;
        if (exception.startTime !== undefined) occurrence.startTime = exception.startTime;
        if (exception.endTime !== undefined) occurrence.endTime = exception.endTime;
        if (exception.owner !== undefined) occurrence.owner = exception.owner;
        if (exception.ownerId !== undefined) occurrence.ownerId = exception.ownerId;
      }

      result.push(occurrence);
    }
  }

  return result;
}

interface CoupleDataContextType {
  events: CalendarEvent[];
  notes: StickyNote[];
  dashboard: DashboardData | null;
  isLoading: boolean;
}

const CoupleDataContext = createContext<CoupleDataContextType>({
  events: [],
  notes: [],
  dashboard: null,
  isLoading: true,
});

export const useCoupleData = () => useContext(CoupleDataContext);

export const CoupleDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { coupleId, user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (coupleId) {
      const eventsRef = collection(db, "couples", coupleId, "events");
      const q = query(eventsRef);

      const unsubsEvents = onSnapshot(q, (snapshot) => {
        const fetchedEvents: CalendarEvent[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          let mappedOwner: EventOwner = data.owner || "us";
          if (data.ownerId && user) {
            if (data.ownerId === "us") mappedOwner = "us";
            else if (data.ownerId === user.uid) mappedOwner = "me";
            else mappedOwner = "partner";
          }

          // Backward compat: compute endTime from durationMinutes if endTime is missing
          let endTime = data.endTime;
          if (!endTime && data.startTime && data.durationMinutes) {
            endTime = computeEndTime(data.startTime, data.durationMinutes);
          }
          if (!endTime) {
            endTime = data.startTime || "13:00"; // fallback
          }

          fetchedEvents.push({ 
            id: docSnap.id, 
            ...data,
            endTime,
            owner: mappedOwner 
          } as CalendarEvent);
        });

        // Expand recurring events before setting state
        const expanded = expandRecurringEvents(fetchedEvents);
        setEvents(expanded);
        setIsLoading(false);
      });

      const notesRef = collection(db, "couples", coupleId, "notes");
      const unsubsNotes = onSnapshot(notesRef, (snapshot) => {
        const fetchedNotes: StickyNote[] = [];
        snapshot.forEach((docSnap) => {
          fetchedNotes.push({ id: docSnap.id, ...docSnap.data() } as StickyNote);
        });
        setNotes(fetchedNotes);
      });

      const dashboardRef = doc(db, "couples", coupleId, "dashboard", "main");
      const unsubsDashboard = onSnapshot(dashboardRef, (docSnap) => {
        if (docSnap.exists()) {
          setDashboard(docSnap.data() as DashboardData);
        } else {
          setDashboard(null);
        }
      });

      return () => {
        unsubsEvents();
        unsubsNotes();
        unsubsDashboard();
      };
    } else {
      setEvents([]);
      setNotes([]);
      setDashboard(null);
      setIsLoading(false);
    }
  }, [coupleId, user?.uid]);

  return (
    <CoupleDataContext.Provider value={{ events, notes, dashboard, isLoading }}>
      {children}
    </CoupleDataContext.Provider>
  );
};
