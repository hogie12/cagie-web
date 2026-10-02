import { useEffect, useMemo, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import {
  CalendarEvent,
  DAY_MINUTES,
  EventOwner,
  layoutDayEvents,
  timeToMinutes,
  toDateStr,
} from "@/lib/recurrence";
import { useSwipe } from "@/hooks/useSwipe";
import {
  OWNER_THEME,
  OwnerNames,
  formatTime,
  formatTimeRange,
  ownerLabel,
} from "../calendarUtils";

const HOUR_HEIGHT = 60; // px per hour => 1px per minute
const PX_PER_MIN = HOUR_HEIGHT / 60;
const GUTTER = 52; // px reserved for hour labels
const MIN_BLOCK = 22; // px, so very short events stay tappable

interface DayTimelineProps {
  date: Date;
  events: CalendarEvent[];
  names: OwnerNames;
  onEventClick: (event: CalendarEvent) => void;
  onCreateAt: (minutes: number, owner: EventOwner) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function DayTimeline({
  date,
  events,
  names,
  onEventClick,
  onCreateAt,
  onPrevDay,
  onNextDay,
}: DayTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState(currentMinutes);
  const swipe = useSwipe(onNextDay, onPrevDay);

  const dateStr = toDateStr(date);
  const todayStr = toDateStr(new Date());
  const isToday = dateStr === todayStr;
  const isPast = dateStr < todayStr;

  const allDay = events.filter((e) => e.allDay);
  const laidOut = useMemo(() => layoutDayEvents(events), [events]);
  const firstStart = laidOut.length
    ? Math.min(...laidOut.map((l) => timeToMinutes(l.event.startTime)))
    : null;

  // Keep the "now" line moving.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMinutes(currentMinutes()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // When a day is opened, scroll to "now" (today) or to the first event / 8 AM.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrolledFor.current === dateStr) return;
    scrolledFor.current = dateStr;
    let target = isToday ? currentMinutes() - 90 : (firstStart ?? 8 * 60) - 30;
    if (isToday && firstStart !== null && firstStart < currentMinutes() && firstStart > currentMinutes() - 180) {
      target = firstStart - 30;
    }
    el.scrollTop = Math.max(0, target * PX_PER_MIN);
  }, [dateStr, isToday, firstStart]);

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const x = e.clientX - rect.left - GUTTER;
    const minutes = Math.floor(y / PX_PER_MIN / 30) * 30; // snap to half hours
    const owner: EventOwner = x > (rect.width - GUTTER) / 2 ? "partner" : "me";
    onCreateAt(Math.max(0, Math.min(DAY_MINUTES - 60, minutes)), owner);
  };

  const hasEnded = (event: CalendarEvent) =>
    isPast || (isToday && !event.allDay && timeToMinutes(event.endTime) <= nowMinutes);

  return (
    <div className="flex-1 flex flex-col min-h-0" {...swipe}>
      {/* Column header + all-day events */}
      <div className="border-b border-border bg-card">
        <div className="flex text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <div style={{ width: GUTTER }} className="shrink-0" />
          <div className="flex-1 flex items-center gap-1.5 py-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full ${OWNER_THEME.me.dot}`} />
            <span className="truncate">{ownerLabel("me", names)}</span>
          </div>
          <div className="flex-1 flex items-center gap-1.5 py-1.5 pl-2 min-w-0">
            <span className={`w-2 h-2 rounded-full ${OWNER_THEME.partner.dot}`} />
            <span className="truncate">{ownerLabel("partner", names)}</span>
          </div>
        </div>
        {allDay.length > 0 && (
          <div className="flex pb-2">
            <div
              style={{ width: GUTTER }}
              className="shrink-0 text-[10px] text-muted-foreground font-medium text-right pr-2 pt-1"
            >
              all-day
            </div>
            <div className="flex-1 flex flex-col gap-1 pr-2 min-w-0">
              {allDay.map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`text-left text-xs font-semibold px-2 py-1 rounded-md truncate ${OWNER_THEME[event.owner].solid} ${
                    isPast ? "opacity-60" : ""
                  }`}
                >
                  {event.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain pb-[96px] md:pb-4">
        <div
          className="relative cursor-pointer select-none"
          style={{ height: 24 * HOUR_HEIGHT }}
          onClick={handleGridClick}
          role="presentation"
        >
          {/* Lane tints */}
          <div className="absolute inset-y-0 right-0 flex pointer-events-none" style={{ left: GUTTER }}>
            <div className={`flex-1 ${OWNER_THEME.me.soft}`} />
            <div className={`flex-1 border-l border-border/70 ${OWNER_THEME.partner.soft}`} />
          </div>

          {/* Hour lines + labels */}
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              {hour > 0 && (
                <>
                  <span
                    className="absolute -top-2 text-[10px] font-medium text-muted-foreground text-right pr-2"
                    style={{ width: GUTTER }}
                  >
                    {formatTime(`${String(hour).padStart(2, "0")}:00`)}
                  </span>
                  <div className="absolute right-0 border-t border-border/70" style={{ left: GUTTER }} />
                </>
              )}
            </div>
          ))}

          {/* Events */}
          {laidOut.map(({ event, left, width }) => {
            const start = timeToMinutes(event.startTime);
            const end = timeToMinutes(event.endTime);
            const height = Math.max((end - start) * PX_PER_MIN, MIN_BLOCK);
            const compact = height < 40;
            const repeating = event.isOccurrence;
            return (
              <button
                key={event.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(event);
                }}
                className={`absolute rounded-lg px-2 overflow-hidden text-left shadow-sm ring-1 ring-card hover:brightness-95 active:scale-[0.99] transition ${
                  OWNER_THEME[event.owner].solid
                } ${hasEnded(event) ? "opacity-55" : ""} ${compact ? "py-0.5" : "py-1"}`}
                style={{
                  top: start * PX_PER_MIN + 1,
                  height: height - 2,
                  left: `calc(${GUTTER}px + (100% - ${GUTTER + 4}px) * ${left} + 2px)`,
                  width: `calc((100% - ${GUTTER + 4}px) * ${width} - 2px)`,
                }}
              >
                <div
                  className={`flex items-center gap-1 font-semibold leading-tight ${compact ? "text-[11px]" : "text-[13px]"}`}
                >
                  {repeating && <Repeat size={10} className="shrink-0 opacity-80" aria-label="Repeats" />}
                  <span className="truncate">{event.title}</span>
                  {compact && (
                    <span className="ml-auto pl-1 shrink-0 font-normal opacity-80">{formatTime(event.startTime)}</span>
                  )}
                </div>
                {!compact && <div className="text-[11px] opacity-85 truncate mt-0.5">{formatTimeRange(event)}</div>}
                {!compact && height >= 72 && event.description && (
                  <div className="text-[11px] opacity-75 mt-1 line-clamp-2 whitespace-pre-wrap">{event.description}</div>
                )}
              </button>
            );
          })}

          {/* Now line */}
          {isToday && (
            <div
              className="absolute right-0 flex items-center pointer-events-none z-10"
              style={{ top: nowMinutes * PX_PER_MIN - 5, left: GUTTER - 5 }}
              aria-hidden
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="flex-1 h-0.5 bg-red-500" />
            </div>
          )}

          {events.length === 0 && (
            <div
              className="absolute inset-x-0 flex justify-center pointer-events-none"
              style={{ top: (isToday ? nowMinutes : 8 * 60) * PX_PER_MIN + 24, paddingLeft: GUTTER }}
            >
              <p className="text-sm text-muted-foreground bg-card/90 border border-border rounded-full px-4 py-1.5 shadow-sm">
                Nothing planned · tap a time to add
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
