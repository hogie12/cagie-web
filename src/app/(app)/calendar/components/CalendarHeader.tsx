import { format, isSameMonth, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { ViewMode } from "../calendarUtils";

interface CalendarHeaderProps {
  view: ViewMode;
  selectedDate: Date;
  onViewChange: (view: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
}

const VIEWS: { id: ViewMode; label: string; shortcut: string }[] = [
  { id: "day", label: "Day", shortcut: "D" },
  { id: "month", label: "Month", shortcut: "M" },
  { id: "agenda", label: "Agenda", shortcut: "A" },
];

export function CalendarHeader({
  view,
  selectedDate,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onAdd,
}: CalendarHeaderProps) {
  const isOnToday =
    view === "month" ? isSameMonth(selectedDate, new Date()) : isToday(selectedDate);
  const unit = view === "month" ? "month" : "day";

  return (
    <header className="px-4 pt-3 pb-2 space-y-2.5">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 min-w-0 text-xl sm:text-2xl font-bold tracking-tight truncate">
          {view === "agenda" ? "Upcoming" : format(selectedDate, "MMMM yyyy")}
        </h1>

        {view !== "agenda" && (
          <div className="flex items-center">
            <button
              onClick={onPrev}
              aria-label={`Previous ${unit}`}
              title={`Previous ${unit} (←)`}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={onNext}
              aria-label={`Next ${unit}`}
              title={`Next ${unit} (→)`}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {view !== "agenda" && (
          <button
            onClick={onToday}
            disabled={isOnToday}
            title="Go to today (T)"
            className="px-3 py-1.5 rounded-full text-sm font-semibold border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Today
          </button>
        )}
        <button
          onClick={onAdd}
          aria-label="Add event"
          title="Add event (N)"
          className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shadow-md hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus size={22} />
        </button>
      </div>

      <div role="tablist" aria-label="Calendar view" className="flex bg-muted p-1 rounded-xl">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            onClick={() => onViewChange(v.id)}
            title={`${v.label} view (${v.shortcut})`}
            className={`flex-1 py-1 rounded-lg text-sm font-semibold transition-all ${
              view === v.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </header>
  );
}
