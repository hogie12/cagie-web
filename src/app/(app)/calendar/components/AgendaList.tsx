import { format } from "date-fns";
import { CalendarHeart, Plus } from "lucide-react";
import { CalendarEvent, toDate } from "@/lib/recurrence";
import { OwnerNames, relativeDayLabel } from "../calendarUtils";
import { EventRow } from "./EventRow";

interface AgendaListProps {
  /** Expanded, filtered, sorted events from today on. */
  events: CalendarEvent[];
  names: OwnerNames;
  nowTime: string; // "HH:mm", to dim today's finished events
  todayStr: string;
  rangeEndLabel: string;
  onEventClick: (event: CalendarEvent) => void;
  onAdd: () => void;
  onLoadMore: () => void;
}

export function AgendaList({
  events,
  names,
  nowTime,
  todayStr,
  rangeEndLabel,
  onEventClick,
  onAdd,
  onLoadMore,
}: AgendaListProps) {
  const groups: { dateStr: string; events: CalendarEvent[] }[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.dateStr === event.dateStr) last.events.push(event);
    else groups.push({ dateStr: event.dateStr, events: [event] });
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-2 sm:px-4 pb-[100px] md:pb-6">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center text-center py-16 px-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
            <CalendarHeart size={28} />
          </div>
          <h2 className="font-bold text-lg">Nothing coming up</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            No plans until {rangeEndLabel}. Time to plan a date?
          </p>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-semibold"
          >
            <Plus size={18} /> Add event
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const date = toDate(group.dateStr);
            const isToday = group.dateStr === todayStr;
            const label = relativeDayLabel(date);
            return (
              <section key={group.dateStr} className="bg-card border border-border rounded-2xl p-2 shadow-sm">
                <h2 className="flex items-baseline gap-2 px-2.5 pt-1.5 pb-1">
                  <span className="font-bold">{label}</span>
                  {!label.includes(",") && (
                    <span className="text-xs text-muted-foreground font-medium">{format(date, "EEE, d MMM")}</span>
                  )}
                </h2>
                {group.events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    names={names}
                    onClick={onEventClick}
                    dimmed={isToday && !event.allDay && event.endTime <= nowTime}
                  />
                ))}
              </section>
            );
          })}
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-xs text-muted-foreground">Showing plans until {rangeEndLabel}</p>
            <button
              onClick={onLoadMore}
              className="px-4 py-2 rounded-full text-sm font-semibold bg-muted hover:bg-border transition-colors"
            >
              Show more
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
