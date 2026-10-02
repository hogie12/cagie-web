import { addDays, differenceInCalendarDays, format, getDate, getDay, getMonth } from "date-fns";

export type EventOwner = "me" | "partner" | "us";
export type RepeatType = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface EventException {
  deleted?: boolean;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  owner?: EventOwner;
  ownerId?: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  dateStr: string; // YYYY-MM-DD (first occurrence for repeating events)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  allDay?: boolean;
  owner: EventOwner;
  ownerId?: string | null; // UID of the owner, or "us"
  description?: string;
  // Recurrence fields
  repeatType?: RepeatType;
  repeatDays?: number[]; // 0=Sun..6=Sat, only for weekly
  repeatUntil?: string; // YYYY-MM-DD inclusive end date; empty/missing = forever
  exceptions?: Record<string, EventException>; // keyed by YYYY-MM-DD
  // Client-only fields (not stored in Firestore)
  isOccurrence?: boolean;
  originalEventId?: string;
}

export const DAY_MINUTES = 24 * 60;

/** "HH:mm" -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight -> "HH:mm", clamped to the same day. */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "yyyy-MM-dd" -> local Date at midnight. */
export function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const toDateStr = (date: Date) => format(date, "yyyy-MM-dd");

export function isRepeating(event: Pick<CalendarEvent, "repeatType">): boolean {
  return !!event.repeatType && event.repeatType !== "none";
}

/** Whether a repeating rule produces an occurrence on `date` (ignores range and exceptions). */
function matchesRule(event: CalendarEvent, start: Date, date: Date): boolean {
  switch (event.repeatType) {
    case "daily":
      return true;
    case "weekly": {
      const days = event.repeatDays?.length ? event.repeatDays : [getDay(start)];
      return days.includes(getDay(date));
    }
    case "monthly":
      return getDate(date) === getDate(start);
    case "yearly":
      return getDate(date) === getDate(start) && getMonth(date) === getMonth(start);
    default:
      return false;
  }
}

function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
  if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
  return a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime);
}

/**
 * Expand events into the occurrences that fall within [rangeStart, rangeEnd]
 * (inclusive, "yyyy-MM-dd"). Non-repeating events are filtered to the range;
 * repeating events become one CalendarEvent per occurrence with exceptions applied.
 */
export function expandRecurringEvents(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): CalendarEvent[] {
  const result: CalendarEvent[] = [];

  for (const event of events) {
    if (!isRepeating(event)) {
      if (event.dateStr >= rangeStart && event.dateStr <= rangeEnd) result.push(event);
      continue;
    }

    const until = event.repeatUntil && event.repeatUntil < rangeEnd ? event.repeatUntil : rangeEnd;
    const from = event.dateStr > rangeStart ? event.dateStr : rangeStart;
    if (from > until) continue;

    const seriesStart = toDate(event.dateStr);
    const fromDate = toDate(from);
    const totalDays = differenceInCalendarDays(toDate(until), fromDate);

    for (let i = 0; i <= totalDays; i++) {
      const current = addDays(fromDate, i);
      if (!matchesRule(event, seriesStart, current)) continue;

      const currentStr = toDateStr(current);
      const exception = event.exceptions?.[currentStr];
      if (exception?.deleted) continue;

      const occurrence: CalendarEvent = {
        ...event,
        dateStr: currentStr,
        isOccurrence: true,
        originalEventId: event.id,
        id: `${event.id}_${currentStr}`,
      };

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

  return result.sort(sortEvents);
}

/** Do two events share a column? "us" spans both columns. */
export function sharesLane(a: EventOwner, b: EventOwner): boolean {
  return a === b || a === "us" || b === "us";
}

export function timesOverlap(
  a: Pick<CalendarEvent, "startTime" | "endTime">,
  b: Pick<CalendarEvent, "startTime" | "endTime">,
): boolean {
  return (
    timeToMinutes(a.startTime) < timeToMinutes(b.endTime) &&
    timeToMinutes(b.startTime) < timeToMinutes(a.endTime)
  );
}

/** Timed events on the same day, in an overlapping column, whose times overlap. */
export function findClashes(
  candidate: Pick<CalendarEvent, "startTime" | "endTime" | "owner" | "allDay">,
  sameDayEvents: CalendarEvent[],
  ignoreIds: string[] = [],
): CalendarEvent[] {
  if (candidate.allDay) return [];
  return sameDayEvents.filter(
    (e) =>
      !e.allDay &&
      !ignoreIds.includes(e.id) &&
      !(e.originalEventId && ignoreIds.includes(e.originalEventId)) &&
      sharesLane(candidate.owner, e.owner) &&
      timesOverlap(candidate, e),
  );
}

export interface LaidOutEvent {
  event: CalendarEvent;
  /** Horizontal position as fractions (0..1) of the event area. */
  left: number;
  width: number;
}

const LANE: Record<EventOwner, { left: number; width: number }> = {
  me: { left: 0, width: 0.5 },
  partner: { left: 0.5, width: 0.5 },
  us: { left: 0, width: 1 },
};

/**
 * Position timed events for a day timeline. Events normally sit in their owner's
 * lane (me = left half, partner = right half, us = full width). When events in a
 * cluster would cover each other, that cluster is packed into side-by-side columns.
 */
export function layoutDayEvents(events: CalendarEvent[]): LaidOutEvent[] {
  const timed = events
    .filter((e) => !e.allDay)
    .sort(
      (a, b) =>
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
        timeToMinutes(b.endTime) - timeToMinutes(a.endTime),
    );

  // Group transitively overlapping events into clusters.
  const clusters: CalendarEvent[][] = [];
  let clusterEnd = -1;
  for (const event of timed) {
    const start = timeToMinutes(event.startTime);
    if (clusters.length === 0 || start >= clusterEnd) {
      clusters.push([event]);
      clusterEnd = timeToMinutes(event.endTime);
    } else {
      clusters[clusters.length - 1].push(event);
      clusterEnd = Math.max(clusterEnd, timeToMinutes(event.endTime));
    }
  }

  const result: LaidOutEvent[] = [];
  for (const cluster of clusters) {
    const conflicts = cluster.some((a, i) =>
      cluster.some((b, j) => j > i && sharesLane(a.owner, b.owner) && timesOverlap(a, b)),
    );

    if (!conflicts) {
      for (const event of cluster) result.push({ event, ...LANE[event.owner] });
      continue;
    }

    // Greedy column packing, keeping "me" events leftmost and "partner" rightmost.
    const order: Record<EventOwner, number> = { me: 0, us: 1, partner: 2 };
    const sorted = [...cluster].sort(
      (a, b) =>
        order[a.owner] - order[b.owner] ||
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );
    const columnEnds: number[] = [];
    const placed: { event: CalendarEvent; column: number }[] = [];
    for (const event of sorted) {
      const start = timeToMinutes(event.startTime);
      let column = columnEnds.findIndex((end) => end <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[column] = timeToMinutes(event.endTime);
      placed.push({ event, column });
    }
    const count = columnEnds.length;
    for (const { event, column } of placed) {
      result.push({ event, left: column / count, width: 1 / count });
    }
  }
  return result;
}
