import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  CalendarEvent,
  DAY_MINUTES,
  RepeatType,
  minutesToTime,
  timeToMinutes,
  toDate,
} from "@/lib/recurrence";
import { errorMessage } from "@/lib/errors";
import {
  EventDraft,
  OWNERS,
  OWNER_THEME,
  OwnerNames,
  WEEKDAYS,
  formatDuration,
  formatTimeRange,
  isWeekdaysPreset,
  ownerLabel,
  validateDraft,
} from "../calendarUtils";

interface EventFormProps {
  initial: EventDraft;
  /** False when editing a single occurrence of a repeating event. */
  allowRepeat: boolean;
  names: OwnerNames;
  findClashes: (draft: EventDraft) => CalendarEvent[];
  submitLabel: string;
  onSubmit: (draft: EventDraft) => Promise<void>;
}

const DURATIONS = [30, 60, 90, 120, 180];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type RepeatChoice = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

const REPEAT_CHOICES: { id: RepeatChoice; label: string }[] = [
  { id: "none", label: "Never" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function repeatChoice(draft: EventDraft): RepeatChoice {
  if (draft.repeatType === "weekly" && isWeekdaysPreset(draft.repeatDays)) return "weekdays";
  return draft.repeatType;
}

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";

function Chip({
  active,
  onClick,
  children,
  className = "",
  activeClassName = "bg-foreground text-background",
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`py-2 px-3 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
        active ? activeClassName : "bg-muted text-muted-foreground hover:bg-border"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EventForm({
  initial,
  allowRepeat,
  names,
  findClashes,
  submitLabel,
  onSubmit,
}: EventFormProps) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<EventDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError("");
  };

  const start = timeToMinutes(draft.startTime);
  const duration = timeToMinutes(draft.endTime) - start;

  const setStart = (value: string) => {
    if (!value) return;
    // Moving the start keeps the duration (like most calendar apps).
    const keep = duration > 0 ? duration : 60;
    update({ startTime: value, endTime: minutesToTime(timeToMinutes(value) + keep) });
  };

  const setRepeat = (choice: RepeatChoice) => {
    const dow = toDate(draft.dateStr).getDay();
    if (choice === "weekdays") update({ repeatType: "weekly", repeatDays: WEEKDAYS });
    else if (choice === "weekly")
      update({
        repeatType: "weekly",
        repeatDays: draft.repeatDays.length && !isWeekdaysPreset(draft.repeatDays) ? draft.repeatDays : [dow],
      });
    else update({ repeatType: choice as RepeatType, repeatDays: [] });
  };

  const toggleDay = (day: number) =>
    update({
      repeatDays: draft.repeatDays.includes(day)
        ? draft.repeatDays.filter((d) => d !== day)
        : [...draft.repeatDays, day].sort(),
    });

  const clashes = findClashes(draft);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      console.error(err);
      setError(errorMessage(err, "Couldn't save the event. Please try again."));
      setSaving(false);
    }
  };

  const choice = repeatChoice(draft);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-1">
      <input
        type="text"
        value={draft.title}
        onChange={(e) => update({ title: e.target.value })}
        placeholder="What's the plan?"
        aria-label="Title"
        maxLength={120}
        autoFocus={!initial.title}
        className="w-full text-xl font-bold bg-transparent border-b-2 border-border focus:border-foreground outline-none py-1.5 placeholder:text-muted-foreground/60 transition-colors"
      />

      <div>
        <span className={labelClass}>Who</span>
        <div className="grid grid-cols-3 gap-2">
          {OWNERS.map((owner) => (
            <Chip
              key={owner}
              active={draft.owner === owner}
              onClick={() => update({ owner })}
              activeClassName={OWNER_THEME[owner].solid}
              className="truncate"
            >
              {ownerLabel(owner, names)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex gap-3 items-end">
        <label className="flex-1">
          <span className={labelClass}>{allowRepeat && draft.repeatType !== "none" ? "Starts" : "Date"}</span>
          <input
            type="date"
            value={draft.dateStr}
            onChange={(e) => e.target.value && update({ dateStr: e.target.value })}
            className={inputClass}
            required
          />
        </label>
        <label className="flex items-center gap-2 pb-2.5 cursor-pointer select-none">
          <span className="text-sm font-semibold">All day</span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(e) => update({ allDay: e.target.checked })}
              className="peer sr-only"
            />
            <span className="w-10 h-6 rounded-full bg-border peer-checked:bg-foreground transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
            <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-card shadow transition-transform peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      {!draft.allDay && (
        <div className="space-y-2.5">
          <div className="flex gap-3">
            <label className="flex-1">
              <span className={labelClass}>Start</span>
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => setStart(e.target.value)}
                className={inputClass}
                required
              />
            </label>
            <label className="flex-1">
              <span className={labelClass}>End</span>
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => e.target.value && update({ endTime: e.target.value })}
                className={inputClass}
                required
              />
            </label>
          </div>
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="group" aria-label="Duration">
            {DURATIONS.map((d) => (
              <Chip
                key={d}
                active={duration === d}
                disabled={start + d >= DAY_MINUTES}
                onClick={() => update({ endTime: minutesToTime(start + d) })}
                className="!py-1.5 !px-3 text-xs disabled:opacity-40"
              >
                {formatDuration(d)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {clashes.length > 0 && (
        <div className="flex gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold">Overlaps with {clashes.length === 1 ? "another plan" : `${clashes.length} plans`}</p>
            <ul className="mt-0.5 space-y-0.5">
              {clashes.slice(0, 3).map((c) => (
                <li key={c.id} className="truncate">
                  {c.title} · {formatTimeRange(c)} · {ownerLabel(c.owner, names)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {allowRepeat && (
        <div className="space-y-3">
          <div>
            <span className={labelClass}>Repeat</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repeat">
              {REPEAT_CHOICES.map((c) => (
                <Chip key={c.id} active={choice === c.id} onClick={() => setRepeat(c.id)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>

          {choice === "weekly" && (
            <div className="flex justify-between gap-1" role="group" aria-label="Repeat on">
              {DAY_LETTERS.map((letter, day) => (
                <button
                  key={day}
                  type="button"
                  aria-label={DAY_NAMES[day]}
                  aria-pressed={draft.repeatDays.includes(day)}
                  onClick={() => toggleDay(day)}
                  className={`w-10 h-10 rounded-full text-sm font-semibold transition-colors ${
                    draft.repeatDays.includes(day)
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-border"
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}

          {draft.repeatType !== "none" && (
            <div className="flex items-end gap-3">
              <label className="flex-1">
                <span className={labelClass}>Ends</span>
                <input
                  type="date"
                  value={draft.repeatUntil}
                  min={draft.dateStr}
                  onChange={(e) => update({ repeatUntil: e.target.value })}
                  className={`${inputClass} ${draft.repeatUntil ? "" : "text-muted-foreground"}`}
                  aria-label="Repeat until"
                />
              </label>
              {draft.repeatUntil ? (
                <button
                  type="button"
                  onClick={() => update({ repeatUntil: "" })}
                  className="pb-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  Never ends
                </button>
              ) : (
                <span className="pb-2.5 text-sm text-muted-foreground">Never ends</span>
              )}
            </div>
          )}
        </div>
      )}

      <label className="block">
        <span className={labelClass}>Notes</span>
        <textarea
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Place, links, what to bring…"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </label>

      {error && (
        <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-foreground text-background font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60"
      >
        {saving && <Loader2 size={18} className="animate-spin" />}
        {saving ? "Saving…" : clashes.length > 0 ? `${submitLabel} anyway` : submitLabel}
      </button>
    </form>
  );
}
