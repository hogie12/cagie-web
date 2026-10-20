// Pure schedule logic for the WhatsApp assistant API (no Firebase imports, unit tested).
// Stored fields mirror src/app/(app)/calendar/eventActions.ts so events look normal in the app.
import { addYears, format, isValid, parse } from "date-fns";
import { CalendarEvent, EventException, RepeatType, expandRecurringEvents } from "./recurrence";

export type StoredEvent = CalendarEvent & { id: string };

export interface ApiEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  allDay: boolean;
  owner: "me" | "us";
  repeat: RepeatType;
  occurrence?: string;
}

export interface EventInput {
  title?: string;
  date?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  owner?: "me" | "us";
  repeat?: RepeatType;
  repeatDays?: number[];
  repeatUntil?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ALL_DAY_START = "00:00";
const ALL_DAY_END = "23:59";
const MAX_RANGE_DAYS = 31;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const REPEATS: RepeatType[] = ["none", "daily", "weekly", "monthly", "yearly"];

const isDate = (s: unknown): s is string =>
  typeof s === "string" && DATE_RE.test(s) && isValid(parse(s, "yyyy-MM-dd", new Date())) &&
  format(parse(s, "yyyy-MM-dd", new Date()), "yyyy-MM-dd") === s;
const isTime = (s: unknown): s is string => typeof s === "string" && TIME_RE.test(s);
const shiftYears = (date: string, years: number) =>
  format(addYears(parse(date, "yyyy-MM-dd", new Date()), years), "yyyy-MM-dd");

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** from <= to, both valid dates, at most 31 days apart. */
export function validRange(from: string, to: string): boolean {
  if (!isDate(from) || !isDate(to) || from > to) return false;
  const days = (parse(to, "yyyy-MM-dd", new Date()).getTime() - parse(from, "yyyy-MM-dd", new Date()).getTime()) / 86_400_000;
  return Math.round(days) <= MAX_RANGE_DAYS;
}

const ownedBy = (ownerId: string | null | undefined, actorUid: string) => ownerId === actorUid || ownerId === "us";

export function canModify(event: StoredEvent, actorUid: string): boolean {
  return ownedBy(event.ownerId, actorUid);
}

/** Events and occurrences in [from, to] that belong to the actor or are shared. Never returns descriptions. */
export function listForActor(events: StoredEvent[], actorUid: string, from: string, to: string): ApiEvent[] {
  return expandRecurringEvents(events, from, to)
    .filter((e) => ownedBy(e.ownerId, actorUid))
    .map((e) => ({
      id: e.originalEventId ?? e.id,
      title: e.title,
      date: e.dateStr,
      start: e.startTime,
      end: e.endTime,
      allDay: !!e.allDay,
      owner: e.ownerId === "us" ? "us" : "me",
      repeat: e.repeatType ?? "none",
      ...(e.isOccurrence ? { occurrence: e.dateStr } : {}),
    }));
}

/** Validates the given fields. "create" also requires title, date and times (or allDay). */
export function validateInput(input: EventInput, today: string, mode: "create" | "update"): Result<EventInput> {
  const fail = (error: string): Result<EventInput> => ({ ok: false, error });
  const v: EventInput = {};

  if (input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > 100) return fail("title must be 1-100 characters");
    v.title = title;
  }
  if (input.date !== undefined) {
    if (!isDate(input.date)) return fail("date must be YYYY-MM-DD");
    if (input.date < shiftYears(today, -1) || input.date > shiftYears(today, 2)) return fail("date out of range");
    v.date = input.date;
  }
  if (input.allDay !== undefined) {
    if (typeof input.allDay !== "boolean") return fail("allDay must be true or false");
    v.allDay = input.allDay;
  }
  for (const key of ["start", "end"] as const) {
    if (input[key] !== undefined) {
      if (!isTime(input[key])) return fail(`${key} must be HH:mm`);
      v[key] = input[key];
    }
  }
  if (input.owner !== undefined) {
    if (input.owner !== "me" && input.owner !== "us") return fail('owner must be "me" or "us"');
    v.owner = input.owner;
  }
  if (input.repeat !== undefined) {
    if (!REPEATS.includes(input.repeat)) return fail("unknown repeat");
    v.repeat = input.repeat;
  }
  if (input.repeatDays !== undefined) {
    if (!Array.isArray(input.repeatDays) || !input.repeatDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return fail("repeatDays must be 0-6");
    }
    v.repeatDays = [...new Set(input.repeatDays)].sort((a, b) => a - b);
  }
  if (input.repeatUntil !== undefined && input.repeatUntil !== "") {
    if (!isDate(input.repeatUntil)) return fail("repeatUntil must be YYYY-MM-DD");
    v.repeatUntil = input.repeatUntil;
  }
  if (v.repeatUntil && v.date && v.repeatUntil < v.date) return fail("repeatUntil is before the date");

  if (mode === "create") {
    if (!v.title) return fail("title is required");
    if (!v.date) return fail("date is required");
    if (!v.allDay && (!v.start || !v.end)) return fail("start and end are required unless allDay");
  }
  if (!v.allDay && v.start && v.end && v.end <= v.start) return fail("end must be after start");
  return { ok: true, value: v };
}

/** Firestore fields for a new event, exactly like the app writes them. */
export function toStored(input: EventInput, actorUid: string): Omit<StoredEvent, "id"> {
  const shared = input.owner === "us";
  const repeat = input.repeat ?? "none";
  return {
    title: (input.title ?? "").trim(),
    description: "",
    dateStr: input.date as string,
    ...(input.allDay
      ? { allDay: true, startTime: ALL_DAY_START, endTime: ALL_DAY_END }
      : { allDay: false, startTime: input.start as string, endTime: input.end as string }),
    owner: shared ? "us" : "me",
    ownerId: shared ? "us" : actorUid,
    ...(repeat === "none"
      ? {}
      : {
          repeatType: repeat,
          ...(repeat === "weekly" && input.repeatDays?.length ? { repeatDays: [...input.repeatDays].sort((a, b) => a - b) } : {}),
          ...(input.repeatUntil ? { repeatUntil: input.repeatUntil } : {}),
        }),
  };
}

/** The full replacement document for an update: current values, overridden by input, validated as a whole. */
export function buildUpdated(
  current: StoredEvent,
  input: EventInput,
  actorUid: string,
  today: string,
): Result<Omit<StoredEvent, "id">> {
  const changesTimes = input.start !== undefined || input.end !== undefined;
  const merged: EventInput = {
    title: current.title,
    date: current.dateStr,
    allDay: !!current.allDay,
    start: current.startTime,
    end: current.endTime,
    owner: current.ownerId === "us" ? "us" : "me",
    repeat: current.repeatType ?? "none",
    repeatDays: current.repeatDays,
    repeatUntil: current.repeatUntil,
    ...Object.fromEntries(Object.entries(input).filter(([, val]) => val !== undefined)),
  };
  if (changesTimes && input.allDay === undefined) merged.allDay = false;

  // The current date may already be in the past; only check the window when the date changes.
  const checked = validateInput(merged, input.date !== undefined ? today : current.dateStr, "create");
  if (!checked.ok) return checked;

  const stored = toStored(checked.value, actorUid);
  return {
    ok: true,
    value: {
      ...stored,
      description: current.description ?? "",
      ...(stored.repeatType && current.exceptions ? { exceptions: current.exceptions } : {}),
    },
  };
}

/** Exceptions map with one occurrence hidden, keeping the others. */
export function withSkippedOccurrence(event: StoredEvent, date: string): { exceptions: Record<string, EventException> } {
  return { exceptions: { ...(event.exceptions ?? {}), [date]: { deleted: true } } };
}
