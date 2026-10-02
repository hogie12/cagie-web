import { addDays, format, isSameDay, isToday, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarEvent, toDateStr } from "@/lib/recurrence";
import { useSwipe } from "@/hooks/useSwipe";
import { OwnerDots } from "./OwnerDots";

interface WeekStripProps {
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelect: (date: Date) => void;
}

export function WeekStrip({ selectedDate, eventsByDate, onSelect }: WeekStripProps) {
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const prevWeek = () => onSelect(addDays(selectedDate, -7));
  const nextWeek = () => onSelect(addDays(selectedDate, 7));
  const swipe = useSwipe(nextWeek, prevWeek);

  return (
    <div className="flex items-center px-1 border-b border-border" {...swipe}>
      <button
        onClick={prevWeek}
        aria-label="Previous week"
        className="p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="flex-1 grid grid-cols-7">
        {days.map((day) => {
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
          const dayEvents = eventsByDate.get(toDateStr(day)) ?? [];
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelect(day)}
              aria-label={format(day, "EEEE d MMMM")}
              aria-pressed={selected}
              className="flex flex-col items-center gap-0.5 py-2 rounded-xl hover:bg-muted/60 transition-colors"
            >
              <span
                className={`text-[11px] font-semibold uppercase ${
                  today ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {format(day, "EEEEE")}
              </span>
              <span
                className={`w-9 h-9 flex items-center justify-center rounded-full text-base font-semibold transition-all ${
                  selected
                    ? "bg-foreground text-background"
                    : today
                      ? "ring-2 ring-primary text-foreground"
                      : "text-foreground/80"
                }`}
              >
                {format(day, "d")}
              </span>
              <span className="h-1.5 flex items-center">
                <OwnerDots events={dayEvents} />
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={nextWeek}
        aria-label="Next week"
        className="p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
