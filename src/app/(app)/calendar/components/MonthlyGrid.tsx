import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ArrowRight, Plus } from "lucide-react";
import { CalendarEvent, toDateStr } from "@/lib/recurrence";
import { useSwipe } from "@/hooks/useSwipe";
import { OWNER_THEME, OwnerNames, relativeDayLabel } from "../calendarUtils";
import { OwnerDots } from "./OwnerDots";
import { EventRow } from "./EventRow";

interface MonthlyGridProps {
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  names: OwnerNames;
  onSelectDate: (date: Date) => void;
  onOpenDay: (date: Date) => void;
  onAdd: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Visible date range of the month grid (full weeks, Monday start). */
export function monthGridRange(date: Date) {
  return {
    start: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
  };
}

export default function MonthlyGrid({
  selectedDate,
  eventsByDate,
  names,
  onSelectDate,
  onOpenDay,
  onAdd,
  onEventClick,
}: MonthlyGridProps) {
  const { start, end } = monthGridRange(selectedDate);
  const days = eachDayOfInterval({ start, end });
  const swipe = useSwipe(
    () => onSelectDate(startOfMonth(addMonths(selectedDate, 1))),
    () => onSelectDate(startOfMonth(addMonths(selectedDate, -1))),
  );

  const selectedEvents = eventsByDate.get(toDateStr(selectedDate)) ?? [];

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-2 sm:px-4 pb-[100px] md:pb-6">
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm" {...swipe}>
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {WEEKDAY_HEADERS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
            >
              <span className="sm:hidden">{day[0]}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const inMonth = isSameMonth(day, selectedDate);
            const selected = isSameDay(day, selectedDate);
            const today = isToday(day);
            const dayEvents = eventsByDate.get(toDateStr(day)) ?? [];

            return (
              <button
                key={day.toISOString()}
                onClick={() => (selected ? onOpenDay(day) : onSelectDate(day))}
                onDoubleClick={() => onOpenDay(day)}
                aria-label={`${format(day, "EEEE d MMMM")}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                aria-pressed={selected}
                className={`min-h-[58px] md:min-h-[104px] p-1 md:p-1.5 flex flex-col items-stretch text-left border-border transition-colors ${
                  idx % 7 !== 6 ? "border-r" : ""
                } ${idx < days.length - 7 ? "border-b" : ""} ${
                  selected ? "bg-primary/15" : inMonth ? "hover:bg-muted/60" : "bg-muted/30 hover:bg-muted/60"
                }`}
              >
                <span className="flex justify-center md:justify-end">
                  <span
                    className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      today
                        ? "bg-foreground text-background"
                        : !inMonth
                          ? "text-muted-foreground/50"
                          : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                </span>

                {/* Phones: owner dots + count */}
                <span className="md:hidden mt-1 flex flex-col items-center gap-0.5">
                  <OwnerDots events={dayEvents} />
                  {dayEvents.length > 1 && (
                    <span className="text-[9px] font-semibold text-muted-foreground leading-none">
                      {dayEvents.length}
                    </span>
                  )}
                </span>

                {/* Larger screens: title chips */}
                <span className="hidden md:flex flex-col gap-0.5 mt-1 min-w-0">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      className={`text-[11px] px-1.5 py-0.5 rounded truncate font-medium ${OWNER_THEME[event.owner].solid}`}
                    >
                      {!event.allDay && <span className="opacity-75 mr-1">{event.startTime}</span>}
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[11px] text-muted-foreground font-medium px-1">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day */}
      <section className="mt-4 bg-card border border-border rounded-2xl p-3 shadow-sm" aria-live="polite">
        <div className="flex items-center justify-between px-1 pb-1">
          <h2 className="font-bold">{relativeDayLabel(selectedDate, true)}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAdd(selectedDate)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold hover:bg-muted transition-colors"
            >
              <Plus size={16} /> Add
            </button>
            <button
              onClick={() => onOpenDay(selectedDate)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold bg-muted hover:bg-border transition-colors"
            >
              Open day <ArrowRight size={16} />
            </button>
          </div>
        </div>
        {selectedEvents.length > 0 ? (
          <div className="flex flex-col">
            {selectedEvents.map((event) => (
              <EventRow key={event.id} event={event} names={names} onClick={onEventClick} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-1 py-3">Nothing planned for this day.</p>
        )}
      </section>
    </div>
  );
}
