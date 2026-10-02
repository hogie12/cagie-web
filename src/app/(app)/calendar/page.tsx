"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, format, startOfDay, startOfWeek } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { useCoupleData } from "@/context/CoupleDataContext";
import { useToast } from "@/context/ToastContext";
import { usePersistentState } from "@/hooks/usePersistentState";
import { Sheet } from "@/components/Sheet";
import {
  CalendarEvent,
  EventOwner,
  expandRecurringEvents,
  findClashes,
  toDate,
  toDateStr,
} from "@/lib/recurrence";
import {
  ALL_OWNERS_VISIBLE,
  EventDraft,
  OwnerFilters as Filters,
  ViewMode,
  defaultStartMinutes,
  draftFromEvent,
  newDraft,
  relativeDayLabel,
} from "./calendarUtils";
import {
  Identity,
  createEvent,
  deleteEvent,
  deleteOccurrence,
  deleteThisAndFollowing,
  updateEvent,
  updateOccurrence,
} from "./eventActions";
import { CalendarHeader } from "./components/CalendarHeader";
import { OwnerFilters } from "./components/OwnerFilters";
import { WeekStrip } from "./components/WeekStrip";
import { DayTimeline } from "./components/DayTimeline";
import MonthlyGrid, { monthGridRange } from "./components/MonthlyGrid";
import { AgendaList } from "./components/AgendaList";
import { EventForm } from "./components/EventForm";
import { DeleteScope, EditScope, EventDetail } from "./components/EventDetail";

type SheetState =
  | { kind: "none" }
  | { kind: "detail"; eventId: string; dateStr: string }
  | {
      kind: "form";
      key: number;
      title: string;
      submitLabel: string;
      initial: EventDraft;
      allowRepeat: boolean;
      ignoreIds: string[];
      save: (draft: EventDraft) => Promise<void>;
      successMessage: string;
      /** Show the saved event's date afterwards (not for series edits). */
      jumpToDate: boolean;
    };

const isViewMode = (v: unknown): v is ViewMode => v === "day" || v === "month" || v === "agenda";
const isFilters = (v: unknown): v is Filters =>
  !!v &&
  typeof v === "object" &&
  ["me", "partner", "us"].every((k) => typeof (v as Record<string, unknown>)[k] === "boolean");

const AGENDA_STEP_DAYS = 60;

export default function CalendarPage() {
  const { user, coupleId, partnerId, userName, partnerName } = useAuth();
  const { events: rawEvents } = useCoupleData();
  const { toast } = useToast();
  const names = useMemo(() => ({ userName, partnerName }), [userName, partnerName]);

  const [view, setView] = usePersistentState<ViewMode>("cagie.calendar.view", "day", isViewMode);
  const [filters, setFilters] = usePersistentState<Filters>(
    "cagie.calendar.filters",
    ALL_OWNERS_VISIBLE,
    isFilters,
  );
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [agendaDays, setAgendaDays] = useState(AGENDA_STEP_DAYS);
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });

  const todayStr = toDateStr(new Date());

  // Only expand repeating events for the dates the current view shows.
  const [rangeStart, rangeEnd] = useMemo(() => {
    if (view === "month") {
      const { start, end } = monthGridRange(selectedDate);
      return [toDateStr(start), toDateStr(end)];
    }
    if (view === "agenda") return [todayStr, toDateStr(addDays(toDate(todayStr), agendaDays))];
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return [toDateStr(weekStart), toDateStr(addDays(weekStart, 6))];
  }, [view, selectedDate, todayStr, agendaDays]);

  const visibleEvents = useMemo(
    () => expandRecurringEvents(rawEvents, rangeStart, rangeEnd).filter((e) => filters[e.owner]),
    [rawEvents, rangeStart, rangeEnd, filters],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of visibleEvents) {
      const list = map.get(e.dateStr);
      if (list) list.push(e);
      else map.set(e.dateStr, [e]);
    }
    return map;
  }, [visibleEvents]);

  const selectedDateStr = toDateStr(selectedDate);
  const dayEvents = eventsByDate.get(selectedDateStr) ?? [];

  const who: Identity | null = user && coupleId ? { coupleId, uid: user.uid, partnerId } : null;

  /** All occurrences on one date, ignoring filters (for clash checks and lookups). */
  const occurrencesOn = useCallback(
    (dateStr: string) => expandRecurringEvents(rawEvents, dateStr, dateStr),
    [rawEvents],
  );

  const closeSheet = useCallback(() => setSheet({ kind: "none" }), []);

  // ─── Opening the form ───

  const openForm = (options: Omit<Extract<SheetState, { kind: "form" }>, "kind" | "key">) =>
    setSheet({ kind: "form", key: Date.now(), ...options });

  const openCreate = (dateStr: string, minutes?: number, owner: EventOwner = "me") => {
    if (!who) return;
    openForm({
      title: "New event",
      submitLabel: "Add event",
      initial: newDraft(dateStr, minutes ?? defaultStartMinutes(dateStr), owner),
      allowRepeat: true,
      ignoreIds: [],
      save: (draft) => createEvent(draft, who),
      successMessage: "Event added",
      jumpToDate: true,
    });
  };

  const findTemplate = (event: CalendarEvent) =>
    event.isOccurrence ? (rawEvents.find((e) => e.id === event.originalEventId) ?? null) : null;

  const openEdit = (event: CalendarEvent, scope: EditScope) => {
    if (!who) return;
    const template = findTemplate(event);
    if (scope === "all" && template) {
      openForm({
        title: "Edit series",
        submitLabel: "Save",
        initial: draftFromEvent(template),
        allowRepeat: true,
        ignoreIds: [template.id],
        save: (draft) => updateEvent(template.id, draft, who),
        successMessage: "Series updated",
        jumpToDate: false,
      });
    } else if (scope === "this") {
      openForm({
        title: "Edit this event",
        submitLabel: "Save",
        initial: { ...draftFromEvent(event), repeatType: "none", repeatDays: [], repeatUntil: "" },
        allowRepeat: false,
        ignoreIds: [event.id],
        save: (draft) => updateOccurrence(event, draft, who),
        successMessage: "Event updated",
        jumpToDate: true,
      });
    } else {
      openForm({
        title: "Edit event",
        submitLabel: "Save",
        initial: draftFromEvent(event),
        allowRepeat: true,
        ignoreIds: [event.id],
        save: (draft) => updateEvent(event.id, draft, who),
        successMessage: "Event updated",
        jumpToDate: true,
      });
    }
  };

  const openDuplicate = (event: CalendarEvent) => {
    if (!who) return;
    openForm({
      title: "Duplicate event",
      submitLabel: "Add copy",
      initial: { ...draftFromEvent(event), dateStr: event.dateStr, repeatType: "none", repeatDays: [], repeatUntil: "" },
      allowRepeat: true,
      ignoreIds: [],
      save: (draft) => createEvent(draft, who),
      successMessage: "Copy added",
      jumpToDate: true,
    });
  };

  const handleDelete = async (event: CalendarEvent, scope: DeleteScope) => {
    if (!who) return;
    const template = findTemplate(event);
    if (scope === "single") await deleteEvent(event.id, who);
    else if (scope === "this") await deleteOccurrence(event, who);
    else if (scope === "following" && template) await deleteThisAndFollowing(event, template, who);
    else if (scope === "all" && template) await deleteEvent(template.id, who);
    closeSheet();
    toast("Deleted", { kind: "success" });
  };

  const submitForm = async (state: Extract<SheetState, { kind: "form" }>, draft: EventDraft) => {
    await state.save(draft);
    closeSheet();
    // Jump to where the event landed so it's visible right away.
    if (state.jumpToDate && view !== "agenda") setSelectedDate(toDate(draft.dateStr));
    toast(state.successMessage, {
      kind: "success",
      body: state.jumpToDate
        ? `${draft.title.trim()} · ${relativeDayLabel(toDate(draft.dateStr), true)}`
        : draft.title.trim(),
    });
  };

  // ─── Navigation ───

  const goPrev = useCallback(
    () => setSelectedDate((d) => (view === "month" ? addMonths(d, -1) : addDays(d, -1))),
    [view],
  );
  const goNext = useCallback(
    () => setSelectedDate((d) => (view === "month" ? addMonths(d, 1) : addDays(d, 1))),
    [view],
  );
  const goToday = useCallback(() => setSelectedDate(startOfDay(new Date())), []);

  const openDay = (date: Date) => {
    setSelectedDate(date);
    setView("day");
  };

  // Keyboard shortcuts (desktop): ←/→, T, N, D/M/A.
  const sheetOpen = sheet.kind !== "none";
  const createOnSelected = () => openCreate(view === "agenda" ? todayStr : selectedDateStr);
  const createRef = useLatest(createOnSelected);
  useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: goPrev,
        ArrowRight: goNext,
        t: goToday,
        n: () => createRef.current(),
        d: () => setView("day"),
        m: () => setView("month"),
        a: () => setView("agenda"),
      };
      const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, goPrev, goNext, goToday, setView, createRef]);

  // ─── Sheet content ───

  let sheetTitle = "";
  let sheetBody: React.ReactNode = null;
  if (sheet.kind === "detail") {
    const event = occurrencesOn(sheet.dateStr).find((e) => e.id === sheet.eventId);
    if (event) {
      sheetTitle = "Event";
      sheetBody = (
        <EventDetail
          key={event.id}
          event={event}
          template={findTemplate(event)}
          names={names}
          onEdit={(scope) => openEdit(event, scope)}
          onDuplicate={() => openDuplicate(event)}
          onDelete={(scope) => handleDelete(event, scope)}
        />
      );
    }
  } else if (sheet.kind === "form") {
    sheetTitle = sheet.title;
    sheetBody = (
      <EventForm
        key={sheet.key}
        initial={sheet.initial}
        allowRepeat={sheet.allowRepeat}
        names={names}
        submitLabel={sheet.submitLabel}
        findClashes={(draft) =>
          findClashes(draft, occurrencesOn(draft.dateStr), sheet.ignoreIds)
        }
        onSubmit={(draft) => submitForm(sheet, draft)}
      />
    );
  }

  const showEvent = (event: CalendarEvent) =>
    setSheet({ kind: "detail", eventId: event.id, dateStr: event.dateStr });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto min-h-0">
        <CalendarHeader
          view={view}
          selectedDate={selectedDate}
          onViewChange={setView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onAdd={createOnSelected}
        />
        <OwnerFilters filters={filters} names={names} onChange={setFilters} />

        {view === "day" && (
          <>
            <WeekStrip selectedDate={selectedDate} eventsByDate={eventsByDate} onSelect={setSelectedDate} />
            <DayTimeline
              date={selectedDate}
              events={dayEvents}
              names={names}
              onEventClick={showEvent}
              onCreateAt={(minutes, owner) => openCreate(selectedDateStr, minutes, owner)}
              onPrevDay={goPrev}
              onNextDay={goNext}
            />
          </>
        )}

        {view === "month" && (
          <MonthlyGrid
            selectedDate={selectedDate}
            eventsByDate={eventsByDate}
            names={names}
            onSelectDate={setSelectedDate}
            onOpenDay={openDay}
            onAdd={(date) => openCreate(toDateStr(date))}
            onEventClick={showEvent}
          />
        )}

        {view === "agenda" && (
          <AgendaList
            events={visibleEvents}
            names={names}
            nowTime={format(new Date(), "HH:mm")}
            todayStr={todayStr}
            rangeEndLabel={format(toDate(rangeEnd), "d MMM yyyy")}
            onEventClick={showEvent}
            onAdd={() => openCreate(todayStr)}
            onLoadMore={() => setAgendaDays((d) => d + AGENDA_STEP_DAYS)}
          />
        )}
      </div>

      <Sheet open={sheetBody !== null} onClose={closeSheet} title={sheetTitle}>
        {sheetBody}
      </Sheet>
    </div>
  );
}

/** Ref that always holds the latest value (for stable event listeners). */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
