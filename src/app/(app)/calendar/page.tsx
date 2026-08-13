"use client";

import { useState, useRef, useEffect } from "react";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  isSameDay,
  isToday,
  parse,
  addMonths,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  X,
  Edit2,
  Trash2,
  Repeat,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  useCoupleData,
  EventOwner,
  CalendarEvent,
  EventException,
} from "@/context/CoupleDataContext";
import { doc, setDoc, collection, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import MonthlyGrid from "./components/MonthlyGrid";

type RepeatType = "none" | "daily" | "weekly";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/** Convert HH:mm to total minutes */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Compute duration in minutes between two HH:mm strings */
function durationBetween(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start);
}

/** Format a repeat rule for display */
function formatRepeatLabel(
  repeatType?: RepeatType,
  repeatDays?: number[],
  repeatUntil?: string,
): string | null {
  if (!repeatType || repeatType === "none") return null;
  let label = "Repeats ";
  if (repeatType === "daily") {
    label += "daily";
  } else if (repeatType === "weekly" && repeatDays?.length) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    label += repeatDays.map((d) => dayNames[d]).join(", ");
  }
  if (repeatUntil) {
    label += ` until ${format(parse(repeatUntil, "yyyy-MM-dd", new Date()), "MMM d, yyyy")}`;
  }
  return label;
}

export default function CalendarPage() {
  const { coupleId, userName, partnerName, user, partnerId } = useAuth();
  const { events } = useCoupleData();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");

  // Filters
  const [showMe, setShowMe] = useState(true);
  const [showPartner, setShowPartner] = useState(true);
  const [showUs, setShowUs] = useState(true);

  // Add Event Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventOwner, setNewEventOwner] = useState<EventOwner>("me");
  const [newStartTime, setNewStartTime] = useState("12:00");
  const [newEndTime, setNewEndTime] = useState("13:00");
  const [newRepeatType, setNewRepeatType] = useState<RepeatType>("none");
  const [newRepeatDays, setNewRepeatDays] = useState<number[]>([]);
  const [newRepeatUntil, setNewRepeatUntil] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // View/Edit Event State
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRecurringPrompt, setShowRecurringPrompt] = useState<"edit" | "delete" | null>(null);
  
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventOwner, setEditEventOwner] = useState<EventOwner>("me");
  const [editStartTime, setEditStartTime] = useState("12:00");
  const [editEndTime, setEditEndTime] = useState("13:00");

  const timelineRef = useRef<HTMLDivElement>(null);

  // Scroll to 6 AM initially
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = 6 * 60; // 6 AM
    }
  }, []);

  // Set default repeatUntil when repeat is enabled
  useEffect(() => {
    if (newRepeatType !== "none" && !newRepeatUntil) {
      setNewRepeatUntil(format(addMonths(selectedDate, 1), "yyyy-MM-dd"));
    }
  }, [newRepeatType, newRepeatUntil, selectedDate]);

  const nextWeek = () => setSelectedDate(addDays(selectedDate, 7));
  const prevWeek = () => setSelectedDate(subDays(selectedDate, 7));

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday start
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i),
  );
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const todayEvents = events.filter((e) => e.dateStr === selectedDateStr);

  // Colors
  const colors = {
    me: {
      bg: "bg-primary",
      text: "text-primary-foreground",
      panel: "bg-primary/10",
    },
    partner: {
      bg: "bg-secondary",
      text: "text-secondary-foreground",
      panel: "bg-secondary/10",
    },
    us: { bg: "bg-accent", text: "text-accent-foreground", panel: "" },
  };

  const HOUR_HEIGHT = 60; // 60px per hour

  const resetAddModal = () => {
    setIsAddOpen(false);
    setNewEventTitle("");
    setNewEventDescription("");
    setNewStartTime("12:00");
    setNewEndTime("13:00");
    setNewRepeatType("none");
    setNewRepeatDays([]);
    setNewRepeatUntil("");
    setModalError("");
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId || !newEventTitle) return;
    setModalError("");

    // Validate end time > start time
    const newStartMins = timeToMinutes(newStartTime);
    const newEndMins = timeToMinutes(newEndTime);
    if (newEndMins <= newStartMins) {
      setModalError("End time must be after start time.");
      return;
    }

    // Check for overlap
    const hasOverlap = todayEvents.some((event) => {
      // Check column conflict
      if (
        newEventOwner !== "us" &&
        event.owner !== "us" &&
        newEventOwner !== event.owner
      ) {
        return false; // no conflict if different columns
      }

      const eStartMins = timeToMinutes(event.startTime);
      const eEndMins = timeToMinutes(event.endTime);

      return (
        Math.max(newStartMins, eStartMins) < Math.min(newEndMins, eEndMins)
      );
    });

    if (hasOverlap) {
      setModalError(
        "Jadwal bertabrakan dengan jadwal yang sudah ada di tanggal/jam tersebut.",
      );
      return;
    }

    // Validate repeat settings
    if (newRepeatType === "weekly" && newRepeatDays.length === 0) {
      setModalError("Please select at least one day for weekly repeat.");
      return;
    }

    setIsSubmitting(true);
    try {
      const eventsRef = collection(db, "couples", coupleId, "events");
      const newEventDoc = doc(eventsRef);

      const eventData: Record<string, unknown> = {
        title: newEventTitle,
        description: newEventDescription,
        owner: newEventOwner,
        ownerId:
          newEventOwner === "us"
            ? "us"
            : newEventOwner === "me"
              ? user?.uid
              : partnerId,
        dateStr: selectedDateStr,
        startTime: newStartTime,
        endTime: newEndTime,
      };

      // Add repeat fields if applicable
      if (newRepeatType !== "none") {
        eventData.repeatType = newRepeatType;
        if (newRepeatType === "weekly") {
          eventData.repeatDays = newRepeatDays;
        }
        eventData.repeatUntil = newRepeatUntil;
      }

      await setDoc(newEventDoc, eventData);
      resetAddModal();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEditEventTitle(event.title);
    setEditEventDescription(event.description || "");
    setEditEventOwner(event.owner);
    setEditStartTime(event.startTime);
    setEditEndTime(event.endTime);
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setShowRecurringPrompt(null);
    setModalError("");
  };

  /** Check if the selected event is a recurring occurrence */
  const isRecurring = selectedEvent?.isOccurrence || 
    (selectedEvent?.repeatType && selectedEvent.repeatType !== "none");

  const handleEditClick = () => {
    if (isRecurring) {
      setShowRecurringPrompt("edit");
    } else {
      setIsEditing(true);
    }
  };

  const handleDeleteClick = () => {
    if (isRecurring) {
      setShowRecurringPrompt("delete");
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleRecurringAction = async (scope: "this" | "all") => {
    if (!selectedEvent || !coupleId) return;
    const action = showRecurringPrompt;
    setShowRecurringPrompt(null);

    const originalId = selectedEvent.originalEventId || selectedEvent.id;

    if (action === "delete") {
      setIsSubmitting(true);
      try {
        if (scope === "all") {
          // Delete the entire template
          await deleteDoc(doc(db, "couples", coupleId, "events", originalId));
        } else {
          // Add deleted exception for this date
          const eventRef = doc(db, "couples", coupleId, "events", originalId);
          await updateDoc(eventRef, {
            [`exceptions.${selectedEvent.dateStr}`]: { deleted: true } as EventException,
          });
        }
        setSelectedEvent(null);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    } else if (action === "edit") {
      if (scope === "all") {
        // Edit the template directly
        setIsEditing(true);
      } else {
        // Edit will create an exception — still open edit form, but handle save differently
        setIsEditing(true);
      }
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent || !coupleId) return;
    setIsSubmitting(true);
    try {
      const eventId = selectedEvent.originalEventId || selectedEvent.id;
      await deleteDoc(doc(db, "couples", coupleId, "events", eventId));
      setSelectedEvent(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId || !selectedEvent || !editEventTitle) return;
    setModalError("");

    // Validate end time > start time
    const newStartMins = timeToMinutes(editStartTime);
    const newEndMins = timeToMinutes(editEndTime);
    if (newEndMins <= newStartMins) {
      setModalError("End time must be after start time.");
      return;
    }

    // Check for overlap excluding current event
    const hasOverlap = todayEvents.some((event) => {
      if (event.id === selectedEvent.id) return false;
      
      if (
        editEventOwner !== "us" &&
        event.owner !== "us" &&
        editEventOwner !== event.owner
      ) {
        return false;
      }

      const eStartMins = timeToMinutes(event.startTime);
      const eEndMins = timeToMinutes(event.endTime);

      return (
        Math.max(newStartMins, eStartMins) < Math.min(newEndMins, eEndMins)
      );
    });

    if (hasOverlap) {
      setModalError(
        "Jadwal bertabrakan dengan jadwal yang sudah ada di tanggal/jam tersebut.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const originalId = selectedEvent.originalEventId || selectedEvent.id;
      const eventRef = doc(db, "couples", coupleId, "events", originalId);

      // If this is a recurring occurrence being edited as "this event only"
      if (selectedEvent.isOccurrence && showRecurringPrompt !== "edit") {
        // Write an exception for this date
        const exception: EventException = {
          title: editEventTitle,
          description: editEventDescription,
          startTime: editStartTime,
          endTime: editEndTime,
          owner: editEventOwner,
          ownerId:
            editEventOwner === "us"
              ? "us"
              : editEventOwner === "me"
                ? user?.uid
                : partnerId || undefined,
        };
        await updateDoc(eventRef, {
          [`exceptions.${selectedEvent.dateStr}`]: exception,
        });
      } else {
        // Update the template/event directly
        await updateDoc(eventRef, {
          title: editEventTitle,
          description: editEventDescription,
          owner: editEventOwner,
          ownerId:
            editEventOwner === "us"
              ? "us"
              : editEventOwner === "me"
                ? user?.uid
                : partnerId,
          startTime: editStartTime,
          endTime: editEndTime,
        });
      }

      setIsEditing(false);
      setSelectedEvent({
        ...selectedEvent,
        title: editEventTitle,
        description: editEventDescription,
        owner: editEventOwner,
        startTime: editStartTime,
        endTime: editEndTime,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRepeatDay = (day: number) => {
    setNewRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 1. Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-2 bg-black text-white rounded-xl shadow-sm hidden sm:block">
            <CalendarIcon size={24} />
          </div>
          <h1 className="text-lg sm:text-xl font-medium text-gray-900 min-w-[120px]">
            {format(selectedDate, "MMMM yyyy")}
          </h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex bg-gray-100 p-0.5 sm:p-1 rounded-lg">
            <button
              onClick={() => setViewMode("daily")}
              className={`px-2 py-1 sm:px-3 sm:py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${viewMode === "daily" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Daily
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-2 py-1 sm:px-3 sm:py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${viewMode === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              Monthly
            </button>
          </div>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-3 py-1.5 bg-primary/10 text-primary font-medium rounded-full text-sm hover:bg-primary/20 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setIsAddOpen(true)}
            className="text-gray-900 p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Plus size={28} />
          </button>
        </div>
      </div>

      {/* 2. Filters */}
      <div className="flex gap-2 px-4 py-2 bg-white">
        <button
          onClick={() => setShowMe(!showMe)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-colors ${showMe ? colors.me.bg + " " + colors.me.text : "bg-gray-100 text-gray-500"}`}
        >
          {showMe ? <CheckCircle2 size={18} /> : <Circle size={18} />}{" "}
          <span className="text-sm sm:text-base truncate">
            {userName || "Me"}
          </span>
        </button>
        <button
          onClick={() => setShowPartner(!showPartner)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-colors ${showPartner ? colors.partner.bg + " " + colors.partner.text : "bg-gray-100 text-gray-500"}`}
        >
          {showPartner ? <CheckCircle2 size={18} /> : <Circle size={18} />}{" "}
          <span className="text-sm sm:text-base truncate">
            {partnerName || "Partner"}
          </span>
        </button>
        <button
          onClick={() => setShowUs(!showUs)}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-colors ${showUs ? colors.us.bg + " " + colors.us.text : "bg-gray-100 text-gray-500"}`}
        >
          {showUs ? <CheckCircle2 size={18} /> : <Circle size={18} />}{" "}
          <span className="text-sm sm:text-base">Us</span>
        </button>
      </div>

      {/* 3. Week Strip */}
      {viewMode === "daily" && (
        <>
          <div className="flex items-center border-b border-gray-100 bg-white px-2">
        <button
          onClick={prevWeek}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 flex overflow-hidden">
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentToday = isToday(day);

            return (
              <div
                key={day.toString()}
                onClick={() => setSelectedDate(day)}
                className="flex-1 flex flex-col items-center py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <span
                  className={`text-xs font-medium mb-1 ${isSelected || isCurrentToday ? "text-gray-900" : "text-gray-400"}`}
                >
                  {format(day, "EE").charAt(0)}
                </span>
                <div
                  className={`w-10 h-10 flex items-center justify-center rounded-2xl text-lg font-medium transition-all ${
                    isSelected
                      ? "bg-gray-100 text-gray-900"
                      : isCurrentToday
                        ? "text-primary font-bold"
                        : "text-gray-400"
                  }`}
                >
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={nextWeek}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 4. Timeline Grid */}
      <div
        className="flex-1 overflow-y-auto relative bg-white pb-[80px] md:pb-0"
        ref={timelineRef}
      >
        {/* Background Columns */}
        <div
          className="absolute top-0 left-[50px] right-0 flex z-0 pointer-events-none"
          style={{ height: `${24 * HOUR_HEIGHT}px` }}
        >
          <div
            className={`flex-1 ${colors.me.panel} border-r border-white/50`}
          />
          <div className={`flex-1 ${colors.partner.panel}`} />
        </div>

        {/* Timeline Rows & Labels */}
        <div className="relative z-10">
          {Array.from({ length: 24 }).map((_, hour) => (
            <div
              key={hour}
              className="flex h-[60px] border-b border-gray-100/50"
            >
              <div className="w-[50px] flex-shrink-0 relative">
                {hour > 0 && (
                  <span className="absolute -top-3 right-2 text-[10px] text-gray-400 font-medium">
                    {format(new Date().setHours(hour, 0), "h aa")}
                  </span>
                )}
              </div>
              <div className="flex-1 flex">
                <div className="flex-1 border-r border-gray-100/50" />
                <div className="flex-1" />
              </div>
            </div>
          ))}

          {/* Events */}
          <AnimatePresence>
            {todayEvents.map((event) => {
              if (event.owner === "me" && !showMe) return null;
              if (event.owner === "partner" && !showPartner) return null;
              if (event.owner === "us" && !showUs) return null;

              const startMins = timeToMinutes(event.startTime);
              const endMins = timeToMinutes(event.endTime);
              const top = startMins * (HOUR_HEIGHT / 60);
              const height = (endMins - startMins) * (HOUR_HEIGHT / 60);

              let left = "left-[50px]";
              let width = "w-[calc(100%-50px)]";
              let zIndex = 20;

              if (event.owner === "me") {
                width = "w-[calc(50%-25px)]";
                left = "left-[50px]";
              } else if (event.owner === "partner") {
                width = "w-[calc(50%-25px)]";
                left = "left-[calc(50%+25px)]";
              } else if (event.owner === "us") {
                zIndex = 30;
              }

              const colorClass = colors[event.owner].bg;
              const textClass = colors[event.owner].text;

              const durationMins = endMins - startMins;
              const durationStr =
                durationMins >= 60
                  ? `${Math.round(durationMins / 60 * 10) / 10}h`
                  : `${durationMins}m`;

              const isRecurringEvent = event.isOccurrence || 
                (event.repeatType && event.repeatType !== "none");

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => handleEventClick(event)}
                  className={`absolute ${left} ${width} ${colorClass} ${textClass} rounded-sm p-1.5 overflow-hidden shadow-sm cursor-pointer hover:opacity-90 transition-opacity`}
                  style={{ top: `${top}px`, height: `${height}px`, zIndex }}
                >
                  <div className="text-[13px] font-semibold leading-tight truncate flex items-center gap-1">
                    {isRecurringEvent && <Repeat size={10} className="flex-shrink-0 opacity-80" />}
                    <span className="truncate">{event.title}</span>
                  </div>
                  <div className="text-[10px] opacity-90 truncate mt-0.5">
                    {format(
                      parse(event.startTime, "HH:mm", new Date()),
                      "h:mm aa",
                    )}{" "}
                    • {durationStr}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      </>
      )}

      {viewMode === "monthly" && (
        <MonthlyGrid
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          events={events}
          colors={colors}
          setViewMode={setViewMode}
          showMe={showMe}
          showPartner={showPartner}
          showUs={showUs}
        />
      )}

      {/* Add Event Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-border max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Add Event</h3>
                <button
                  onClick={resetAddModal}
                  className="p-2 bg-muted rounded-full hover:bg-gray-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {modalError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleAddEvent} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Title
                  </label>
                  <input
                    type="text"
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    placeholder="e.g. Dinner Date"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Description
                  </label>
                  <textarea
                    value={newEventDescription}
                    onChange={(e) => setNewEventDescription(e.target.value)}
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all min-h-[80px]"
                    placeholder="Optional details..."
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Who
                  </label>
                  <div className="flex gap-2 mt-1">
                    {(["me", "partner", "us"] as EventOwner[]).map((owner) => (
                      <button
                        key={owner}
                        type="button"
                        onClick={() => setNewEventOwner(owner)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize truncate px-1 ${
                          newEventOwner === owner
                            ? colors[owner].bg + " " + colors[owner].text
                            : "bg-muted text-muted-foreground hover:bg-gray-200"
                        }`}
                      >
                        {owner === "me"
                          ? userName || "Me"
                          : owner === "partner"
                            ? partnerName || "Partner"
                            : "Us"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Range */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      Start
                    </label>
                    <input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      End
                    </label>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Repeat Section */}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Repeat
                  </label>
                  <div className="flex gap-2 mt-1">
                    {(["none", "daily", "weekly"] as RepeatType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setNewRepeatType(type);
                          if (type === "none") {
                            setNewRepeatDays([]);
                            setNewRepeatUntil("");
                          }
                        }}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
                          newRepeatType === type
                            ? "bg-gray-900 text-white"
                            : "bg-muted text-muted-foreground hover:bg-gray-200"
                        }`}
                      >
                        {type === "none" ? "None" : type === "daily" ? "Daily" : "Weekly"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Weekly Day Picker */}
                {newRepeatType === "weekly" && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Repeat on
                    </label>
                    <div className="flex gap-1.5 mt-1">
                      {DAY_LABELS.map((label, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleRepeatDay(idx)}
                          className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
                            newRepeatDays.includes(idx)
                              ? "bg-gray-900 text-white scale-105"
                              : "bg-muted text-muted-foreground hover:bg-gray-200"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Until Date */}
                {newRepeatType !== "none" && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Until
                    </label>
                    <input
                      type="date"
                      value={newRepeatUntil}
                      onChange={(e) => setNewRepeatUntil(e.target.value)}
                      min={selectedDateStr}
                      className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !newEventTitle}
                  className="w-full mt-4 py-4 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Event"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View/Edit Event Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="bg-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-border overflow-hidden relative"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  {isEditing ? "Edit Event" : "Event Details"}
                </h3>
                <div className="flex items-center gap-2">
                  {!isEditing && !showRecurringPrompt && (
                    <>
                      <button
                        onClick={handleEditClick}
                        className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={handleDeleteClick}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setSelectedEvent(null);
                      setIsEditing(false);
                      setShowDeleteConfirm(false);
                      setShowRecurringPrompt(null);
                    }}
                    className="p-2 bg-muted rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {modalError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">
                  {modalError}
                </div>
              )}

              {/* Recurring Action Prompt */}
              {showRecurringPrompt && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 font-medium">
                    This is a repeating event. {showRecurringPrompt === "edit" ? "Edit" : "Delete"}:
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRecurringAction("this")}
                      className="flex-1 py-3 bg-muted text-foreground rounded-xl font-bold hover:bg-gray-200 transition-colors text-sm"
                    >
                      This event only
                    </button>
                    <button
                      onClick={() => handleRecurringAction("all")}
                      className={`flex-1 py-3 rounded-xl font-bold transition-colors text-sm ${
                        showRecurringPrompt === "delete"
                          ? "bg-red-500 text-white hover:bg-red-600"
                          : "bg-primary text-primary-foreground hover:opacity-90"
                      }`}
                    >
                      All events
                    </button>
                  </div>
                </div>
              )}

              {/* View Mode */}
              {!isEditing && !showRecurringPrompt && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-2xl font-bold text-gray-900">{selectedEvent.title}</h4>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`px-2 py-1 text-xs font-bold rounded-md ${colors[selectedEvent.owner].bg} ${colors[selectedEvent.owner].text} uppercase`}>
                        {selectedEvent.owner === "me"
                          ? userName || "Me"
                          : selectedEvent.owner === "partner"
                            ? partnerName || "Partner"
                            : "Us"}
                      </span>
                      <span className="text-sm font-medium text-gray-500">
                        {format(parse(selectedEvent.startTime, "HH:mm", new Date()), "h:mm aa")} 
                        {" - "} 
                        {format(parse(selectedEvent.endTime, "HH:mm", new Date()), "h:mm aa")}
                      </span>
                    </div>

                    {/* Repeat badge */}
                    {(() => {
                      const repeatLabel = formatRepeatLabel(
                        selectedEvent.repeatType as RepeatType,
                        selectedEvent.repeatDays,
                        selectedEvent.repeatUntil,
                      );
                      if (!repeatLabel) return null;
                      return (
                        <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-500">
                          <Repeat size={14} className="text-gray-400" />
                          <span>{repeatLabel}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {selectedEvent.description && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEvent.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Edit Mode */}
              {isEditing && (
                <form onSubmit={handleUpdateEvent} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Title</label>
                    <input
                      type="text"
                      value={editEventTitle}
                      onChange={(e) => setEditEventTitle(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <textarea
                      value={editEventDescription}
                      onChange={(e) => setEditEventDescription(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all min-h-[80px]"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Who</label>
                    <div className="flex gap-2 mt-1">
                      {(["me", "partner", "us"] as EventOwner[]).map((owner) => (
                        <button
                          key={owner}
                          type="button"
                          onClick={() => setEditEventOwner(owner)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize truncate px-1 ${
                            editEventOwner === owner
                              ? colors[owner].bg + " " + colors[owner].text
                              : "bg-muted text-muted-foreground hover:bg-gray-200"
                          }`}
                        >
                          {owner === "me" ? userName || "Me" : owner === "partner" ? partnerName || "Partner" : "Us"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Range */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-muted-foreground">Start</label>
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm font-medium text-muted-foreground">End</label>
                      <input
                        type="time"
                        value={editEndTime}
                        onChange={(e) => setEditEndTime(e.target.value)}
                        className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 py-3 bg-muted text-muted-foreground rounded-xl font-bold hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !editEventTitle}
                      className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isSubmitting ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              )}

              {/* Delete Confirmation Overlay */}
              <AnimatePresence>
                {showDeleteConfirm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center"
                  >
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
                      <Trash2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Event?</h3>
                    <p className="text-gray-500 mb-6">
                      Are you sure you want to delete &quot;{selectedEvent.title}&quot;? This action cannot be undone.
                    </p>
                    <div className="flex gap-3 w-full">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteEvent}
                        disabled={isSubmitting}
                        className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {isSubmitting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
