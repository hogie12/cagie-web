import { Check } from "lucide-react";
import { OWNERS, OWNER_THEME, OwnerFilters as Filters, OwnerNames, ownerLabel } from "../calendarUtils";

interface OwnerFiltersProps {
  filters: Filters;
  names: OwnerNames;
  onChange: (filters: Filters) => void;
}

export function OwnerFilters({ filters, names, onChange }: OwnerFiltersProps) {
  return (
    <div className="flex gap-2 px-4 pb-2 overflow-x-auto" role="group" aria-label="Show events for">
      {OWNERS.map((owner) => {
        const active = filters[owner];
        return (
          <button
            key={owner}
            aria-pressed={active}
            onClick={() => onChange({ ...filters, [owner]: !active })}
            className={`flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full text-[13px] font-medium border transition-all shrink-0 ${
              active
                ? "border-transparent bg-muted text-foreground"
                : "border-border text-muted-foreground opacity-60"
            }`}
          >
            <span
              className={`w-[18px] h-[18px] rounded-full flex items-center justify-center ${
                active ? OWNER_THEME[owner].solid : "border-2 border-border"
              }`}
            >
              {active && <Check size={11} strokeWidth={3} />}
            </span>
            <span className="max-w-[9rem] truncate">{ownerLabel(owner, names)}</span>
          </button>
        );
      })}
    </div>
  );
}
