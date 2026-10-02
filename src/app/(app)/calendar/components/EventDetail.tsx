import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Clock, Copy, Loader2, Pencil, Repeat, Trash2 } from "lucide-react";
import { CalendarEvent, timeToMinutes, toDate } from "@/lib/recurrence";
import { errorMessage } from "@/lib/errors";
import {
  OWNER_THEME,
  OwnerNames,
  formatDuration,
  formatRepeatLabel,
  formatTimeRange,
  ownerLabel,
} from "../calendarUtils";

export type EditScope = "single" | "this" | "all";
export type DeleteScope = "single" | "this" | "following" | "all";

interface EventDetailProps {
  event: CalendarEvent;
  /** The series template, when `event` is an occurrence of a repeating event. */
  template: CalendarEvent | null;
  names: OwnerNames;
  onEdit: (scope: EditScope) => void;
  onDuplicate: () => void;
  onDelete: (scope: DeleteScope) => Promise<void>;
}

type Mode = "view" | "edit-scope" | "delete-scope" | "delete-confirm";

export function EventDetail({ event, template, names, onEdit, onDuplicate, onDelete }: EventDetailProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const repeating = !!template;
  const repeatLabel = template ? formatRepeatLabel(template) : null;
  const minutes = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);

  const runDelete = async (scope: DeleteScope) => {
    setBusy(true);
    setError("");
    try {
      await onDelete(scope);
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, "Couldn't delete. Please try again."));
      setBusy(false);
    }
  };

  if (mode === "edit-scope" || mode === "delete-scope") {
    const editing = mode === "edit-scope";
    const options: { label: string; hint: string; onClick: () => void }[] = editing
      ? [
          { label: "This event", hint: format(toDate(event.dateStr), "EEE, d MMM"), onClick: () => onEdit("this") },
          { label: "All events in the series", hint: repeatLabel ?? "", onClick: () => onEdit("all") },
        ]
      : [
          { label: "This event", hint: format(toDate(event.dateStr), "EEE, d MMM"), onClick: () => runDelete("this") },
          { label: "This and following events", hint: "Ends the series here", onClick: () => runDelete("following") },
          { label: "All events in the series", hint: repeatLabel ?? "", onClick: () => runDelete("all") },
        ];
    return (
      <div className="space-y-3 pt-1">
        <p className="text-sm text-muted-foreground">
          &ldquo;{event.title}&rdquo; repeats. Which events do you want to {editing ? "edit" : "delete"}?
        </p>
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <button
              key={o.label}
              onClick={o.onClick}
              disabled={busy}
              className={`text-left px-4 py-3 rounded-2xl border border-border hover:bg-muted transition-colors disabled:opacity-50 ${
                editing ? "" : "hover:border-red-200"
              }`}
            >
              <span className={`block font-semibold ${editing ? "" : "text-red-600"}`}>{o.label}</span>
              {o.hint && <span className="block text-xs text-muted-foreground mt-0.5">{o.hint}</span>}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          onClick={() => setMode("view")}
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-muted font-semibold hover:bg-border transition-colors"
        >
          {busy ? <Loader2 size={18} className="animate-spin mx-auto" /> : "Cancel"}
        </button>
      </div>
    );
  }

  if (mode === "delete-confirm") {
    return (
      <div className="space-y-4 pt-1 text-center">
        <div className="w-14 h-14 mx-auto bg-red-100 text-red-500 rounded-full flex items-center justify-center">
          <Trash2 size={26} />
        </div>
        <p className="text-muted-foreground">
          Delete &ldquo;<span className="font-semibold text-foreground">{event.title}</span>&rdquo;? This can&apos;t be
          undone.
        </p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => setMode("view")}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-muted font-semibold hover:bg-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => runDelete("single")}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={18} className="animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1">
      <div>
        <h3 className="text-2xl font-bold leading-tight break-words">{event.title}</h3>
        <span
          className={`inline-block mt-2 px-2.5 py-0.5 text-xs font-bold rounded-full ${OWNER_THEME[event.owner].solid}`}
        >
          {ownerLabel(event.owner, names)}
        </span>
      </div>

      <ul className="space-y-2.5 text-sm">
        <li className="flex items-center gap-3">
          <CalendarDays size={18} className="text-muted-foreground shrink-0" />
          <span className="font-medium">{format(toDate(event.dateStr), "EEEE, d MMMM yyyy")}</span>
        </li>
        <li className="flex items-center gap-3">
          <Clock size={18} className="text-muted-foreground shrink-0" />
          <span className="font-medium">
            {formatTimeRange(event)}
            {!event.allDay && minutes > 0 && (
              <span className="text-muted-foreground font-normal"> · {formatDuration(minutes)}</span>
            )}
          </span>
        </li>
        {repeatLabel && (
          <li className="flex items-center gap-3">
            <Repeat size={18} className="text-muted-foreground shrink-0" />
            <span className="font-medium">{repeatLabel}</span>
          </li>
        )}
      </ul>

      {event.description && (
        <p className="p-3.5 bg-muted rounded-2xl text-sm whitespace-pre-wrap break-words">{event.description}</p>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          onClick={() => (repeating ? setMode("edit-scope") : onEdit("single"))}
          className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-muted hover:bg-border font-semibold text-sm transition-colors"
        >
          <Pencil size={18} /> Edit
        </button>
        <button
          onClick={onDuplicate}
          className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-muted hover:bg-border font-semibold text-sm transition-colors"
        >
          <Copy size={18} /> Duplicate
        </button>
        <button
          onClick={() => setMode(repeating ? "delete-scope" : "delete-confirm")}
          className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-sm transition-colors"
        >
          <Trash2 size={18} /> Delete
        </button>
      </div>
    </div>
  );
}
