import { Repeat } from "lucide-react";
import { CalendarEvent } from "@/lib/recurrence";
import { OWNER_THEME, OwnerNames, formatTime, ownerLabel } from "../calendarUtils";

interface EventRowProps {
  event: CalendarEvent;
  names: OwnerNames;
  onClick: (event: CalendarEvent) => void;
  dimmed?: boolean;
}

/** A compact list row used by the Agenda view and the month view's day list. */
export function EventRow({ event, names, onClick, dimmed }: EventRowProps) {
  const theme = OWNER_THEME[event.owner];
  return (
    <button
      onClick={() => onClick(event)}
      className={`w-full flex items-stretch gap-3 p-2.5 rounded-2xl text-left hover:bg-muted/70 active:scale-[0.99] transition ${
        dimmed ? "opacity-55" : ""
      }`}
    >
      <span className={`w-1.5 rounded-full shrink-0 ${theme.bar}`} aria-hidden />
      <span className="w-[4.75rem] shrink-0 text-xs font-semibold text-muted-foreground pt-0.5 leading-snug">
        {event.allDay ? (
          <span className="block text-foreground">All day</span>
        ) : (
          <>
            <span className="block text-foreground">{formatTime(event.startTime)}</span>
            <span className="block">{formatTime(event.endTime)}</span>
          </>
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 font-semibold truncate">
          {event.isOccurrence && <Repeat size={12} className="shrink-0 text-muted-foreground" aria-label="Repeats" />}
          <span className="truncate">{event.title}</span>
        </span>
        <span className="block text-xs text-muted-foreground truncate">
          {ownerLabel(event.owner, names)}
          {event.description ? ` · ${event.description}` : ""}
        </span>
      </span>
    </button>
  );
}
