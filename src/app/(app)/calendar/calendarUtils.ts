import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import {
  CalendarEvent,
  EventOwner,
  RepeatType,
  minutesToTime,
  timeToMinutes,
  toDate,
} from "@/lib/recurrence";

export type ViewMode = "day" | "month" | "agenda";

export const OWNERS: EventOwner[] = ["me", "partner", "us"];

/** Tailwind classes per owner. Keep in sync with the theme tokens in globals.css. */
export const OWNER_THEME: Record<
  EventOwner,
  { solid: string; soft: string; dot: string; bar: string; ring: string }
> = {
  me: {
    solid: "bg-primary text-primary-foreground",
    soft: "bg-primary/10",
    dot: "bg-primary",
    bar: "bg-primary",
    ring: "ring-primary",
  },
  partner: {
    solid: "bg-secondary text-secondary-foreground",
    soft: "bg-secondary/[0.06]",
    dot: "bg-secondary",
    bar: "bg-secondary",
    ring: "ring-secondary",
  },
  us: {
    solid: "bg-accent text-accent-foreground",
    soft: "bg-accent/10",
    dot: "bg-accent",
    bar: "bg-accent",
    ring: "ring-accent",
  },
};

export interface OwnerNames {
  userName: string | null;
  partnerName: string | null;
}

export function ownerLabel(owner: EventOwner, names: OwnerNames): string {
  if (owner === "me") return names.userName || "Me";
  if (owner === "partner") return names.partnerName || "Partner";
  return "Us";
}

export type OwnerFilters = Record<EventOwner, boolean>;

export const ALL_OWNERS_VISIBLE: OwnerFilters = { me: true, partner: true, us: true };

/** "19:30" -> "7:30 PM" */
export function formatTime(time: string): string {
  const minutes = timeToMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatTimeRange(event: Pick<CalendarEvent, "startTime" | "endTime" | "allDay">): string {
  if (event.allDay) return "All day";
  return `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "Today", "Tomorrow", "Yesterday" or "Sat, 4 Oct". */
export function relativeDayLabel(date: Date, withYear = false): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, withYear ? "EEE, d MMM yyyy" : "EEE, d MMM");
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS = [1, 2, 3, 4, 5];

export const isWeekdaysPreset = (days: number[] | undefined) =>
  !!days && days.length === 5 && WEEKDAYS.every((d) => days.includes(d));

export function formatRepeatLabel(
  event: Pick<CalendarEvent, "repeatType" | "repeatDays" | "repeatUntil" | "dateStr">,
): string | null {
  const start = toDate(event.dateStr);
  let label: string;
  switch (event.repeatType) {
    case "daily":
      label = "Every day";
      break;
    case "weekly": {
      const days = event.repeatDays?.length ? event.repeatDays : [start.getDay()];
      label = isWeekdaysPreset(days)
        ? "Every weekday"
        : `Weekly on ${[...days].sort().map((d) => DAY_NAMES[d]).join(", ")}`;
      break;
    }
    case "monthly":
      label = `Monthly on day ${format(start, "d")}`;
      break;
    case "yearly":
      label = `Every year on ${format(start, "d MMM")}`;
      break;
    default:
      return null;
  }
  if (event.repeatUntil) label += `, until ${format(toDate(event.repeatUntil), "d MMM yyyy")}`;
  return label;
}

/** Everything the event form edits. */
export interface EventDraft {
  title: string;
  description: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  owner: EventOwner;
  repeatType: RepeatType;
  repeatDays: number[];
  repeatUntil: string; // "" = forever
}

export function draftFromEvent(event: CalendarEvent): EventDraft {
  return {
    title: event.title,
    description: event.description || "",
    dateStr: event.dateStr,
    startTime: event.allDay ? "09:00" : event.startTime,
    endTime: event.allDay ? "10:00" : event.endTime,
    allDay: !!event.allDay,
    owner: event.owner,
    repeatType: event.repeatType || "none",
    repeatDays: event.repeatDays || [],
    repeatUntil: event.repeatUntil || "",
  };
}

export function newDraft(dateStr: string, startMinutes: number, owner: EventOwner): EventDraft {
  const start = Math.min(startMinutes, 23 * 60);
  return {
    title: "",
    description: "",
    dateStr,
    startTime: minutesToTime(start),
    endTime: minutesToTime(start + 60),
    allDay: false,
    owner,
    repeatType: "none",
    repeatDays: [],
    repeatUntil: "",
  };
}

/** Default start for "+" : the next full hour today, otherwise 9 AM. */
export function defaultStartMinutes(dateStr: string, now = new Date()): number {
  if (dateStr !== format(now, "yyyy-MM-dd")) return 9 * 60;
  return Math.min(23 * 60, (now.getHours() + 1) * 60);
}

export function validateDraft(draft: EventDraft): string | null {
  if (!draft.title.trim()) return "Give your event a title.";
  if (!draft.dateStr) return "Pick a date.";
  if (!draft.allDay && timeToMinutes(draft.endTime) <= timeToMinutes(draft.startTime)) {
    return "End time must be after the start time.";
  }
  if (draft.repeatType === "weekly" && draft.repeatDays.length === 0) {
    return "Pick at least one day for the weekly repeat.";
  }
  if (draft.repeatType !== "none" && draft.repeatUntil && draft.repeatUntil < draft.dateStr) {
    return "The repeat end date is before the event date.";
  }
  return null;
}
