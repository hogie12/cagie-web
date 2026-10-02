import { CalendarEvent, EventOwner } from "@/lib/recurrence";
import { OWNERS, OWNER_THEME } from "../calendarUtils";

/** One dot per owner that has something that day (me, partner, us). */
export function OwnerDots({ events, className = "" }: { events: CalendarEvent[]; className?: string }) {
  const owners = new Set<EventOwner>(events.map((e) => e.owner));
  if (owners.size === 0) return null;
  return (
    <span className={`flex items-center justify-center gap-0.5 ${className}`} aria-hidden>
      {OWNERS.filter((o) => owners.has(o)).map((o) => (
        <span key={o} className={`w-1.5 h-1.5 rounded-full ${OWNER_THEME[o].dot}`} />
      ))}
    </span>
  );
}
