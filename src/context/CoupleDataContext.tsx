"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot, query, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";

export type EventOwner = "me" | "partner" | "us";

export interface CalendarEvent {
  id: string;
  title: string;
  dateStr: string; // YYYY-MM-DD for easier querying
  startTime: string; // HH:mm
  durationMinutes: number;
  owner: EventOwner;
  ownerId?: string; // UID of the user who created it
  categoryId?: string;
  description?: string;
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
  greeting?: string;
  greetingBy?: string;
  papUrl?: string;
  papBy?: string;
  papTimestamp?: unknown;
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
          fetchedEvents.push({ 
            id: docSnap.id, 
            ...data,
            owner: mappedOwner 
          } as CalendarEvent);
        });
        setEvents(fetchedEvents);
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
