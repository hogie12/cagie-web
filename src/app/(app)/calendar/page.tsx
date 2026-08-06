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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import {
  useCoupleData,
  EventOwner,
  CalendarEvent,
} from "@/context/CoupleDataContext";
import { doc, setDoc, collection, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import MonthlyGrid from "./components/MonthlyGrid";

export default function CalendarPage() {
  const { coupleId, userName, partnerName, user, partnerId } = useAuth();
  const { events } = useCoupleData();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");

  // Filters
  const [showMe, setShowMe] = useState(true);
  const [showPartner, setShowPartner] = useState(true);
  const [showUs, setShowUs] = useState(true);

  // Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventOwner, setNewEventOwner] = useState<EventOwner>("me");
  const [newStartTime, setNewStartTime] = useState("12:00");
  const [newDuration, setNewDuration] = useState("60");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  // View/Edit Event State
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventOwner, setEditEventOwner] = useState<EventOwner>("me");
  const [editStartTime, setEditStartTime] = useState("12:00");
  const [editDuration, setEditDuration] = useState("60");

  const timelineRef = useRef<HTMLDivElement>(null);

  // Scroll to 6 AM initially
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = 6 * 60; // 6 AM
    }
  }, []);

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

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coupleId || !newEventTitle) return;
    setModalError("");

    // Check for overlap
    const [newHours, newMins] = newStartTime.split(":").map(Number);
    const newStartMins = newHours * 60 + newMins;
    const newEndMins = newStartMins + parseInt(newDuration, 10);

    const hasOverlap = todayEvents.some((event) => {
      // Check column conflict
      if (
        newEventOwner !== "us" &&
        event.owner !== "us" &&
        newEventOwner !== event.owner
      ) {
        return false; // no conflict if different columns
      }

      const [eHours, eMins] = event.startTime.split(":").map(Number);
      const eStartMins = eHours * 60 + eMins;
      const eEndMins = eStartMins + event.durationMinutes;

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
      const eventsRef = collection(db, "couples", coupleId, "events");
      const newEventDoc = doc(eventsRef);
      await setDoc(newEventDoc, {
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
        durationMinutes: parseInt(newDuration, 10),
      });

      setIsAddOpen(false);
      setNewEventTitle("");
      setNewEventDescription("");
      setNewStartTime("12:00");
      setNewDuration("60");
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
    setEditDuration(event.durationMinutes.toString());
    setIsEditing(false);
    setShowDeleteConfirm(false);
    setModalError("");
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent || !coupleId) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "couples", coupleId, "events", selectedEvent.id));
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

    // Check for overlap excluding current event
    const [newHours, newMins] = editStartTime.split(":").map(Number);
    const newStartMins = newHours * 60 + newMins;
    const newEndMins = newStartMins + parseInt(editDuration, 10);

    const hasOverlap = todayEvents.some((event) => {
      if (event.id === selectedEvent.id) return false;
      
      if (
        editEventOwner !== "us" &&
        event.owner !== "us" &&
        editEventOwner !== event.owner
      ) {
        return false;
      }

      const [eHours, eMins] = event.startTime.split(":").map(Number);
      const eStartMins = eHours * 60 + eMins;
      const eEndMins = eStartMins + event.durationMinutes;

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
      const eventRef = doc(db, "couples", coupleId, "events", selectedEvent.id);
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
        durationMinutes: parseInt(editDuration, 10),
      });

      setIsEditing(false);
      setSelectedEvent({
        ...selectedEvent,
        title: editEventTitle,
        description: editEventDescription,
        owner: editEventOwner,
        startTime: editStartTime,
        durationMinutes: parseInt(editDuration, 10)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
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

              const [hours, minutes] = event.startTime.split(":").map(Number);
              const top = hours * HOUR_HEIGHT + minutes * (HOUR_HEIGHT / 60);
              const height = event.durationMinutes * (HOUR_HEIGHT / 60);

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

              const durationStr =
                event.durationMinutes >= 60
                  ? `${event.durationMinutes / 60}h`
                  : `${event.durationMinutes}m`;

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
                  <div className="text-[13px] font-semibold leading-tight truncate">
                    {event.title}
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
              className="bg-card w-full max-w-md rounded-3xl p-6 shadow-2xl border border-border"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Add Event</h3>
                <button
                  onClick={() => {
                    setIsAddOpen(false);
                    setModalError("");
                  }}
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

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      Time
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
                      Duration
                    </label>
                    <select
                      value={newDuration}
                      onChange={(e) => setNewDuration(e.target.value)}
                      className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="45">45 min</option>
                      <option value="60">1 hour</option>
                      <option value="90">1.5 hours</option>
                      <option value="120">2 hours</option>
                      <option value="180">3 hours</option>
                      <option value="240">4 hours</option>
                    </select>
                  </div>
                </div>

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
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
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

              {/* View Mode */}
              {!isEditing && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-2xl font-bold text-gray-900">{selectedEvent.title}</h4>
                    <div className="flex items-center gap-2 mt-2">
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
                        {format(addDays(parse(selectedEvent.startTime, "HH:mm", new Date()), 0).setMinutes(parse(selectedEvent.startTime, "HH:mm", new Date()).getMinutes() + selectedEvent.durationMinutes), "h:mm aa")}
                      </span>
                    </div>
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

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-muted-foreground">Time</label>
                      <input
                        type="time"
                        value={editStartTime}
                        onChange={(e) => setEditStartTime(e.target.value)}
                        className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm font-medium text-muted-foreground">Duration</label>
                      <select
                        value={editDuration}
                        onChange={(e) => setEditDuration(e.target.value)}
                        className="w-full mt-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                      >
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">1 hour</option>
                        <option value="90">1.5 hours</option>
                        <option value="120">2 hours</option>
                        <option value="180">3 hours</option>
                        <option value="240">4 hours</option>
                      </select>
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
                      Are you sure you want to delete "{selectedEvent.title}"? This action cannot be undone.
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
