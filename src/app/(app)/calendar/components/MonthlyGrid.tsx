import React from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  isSameDay,
} from "date-fns";
import { CalendarEvent, EventOwner } from "@/context/CoupleDataContext";

interface MonthlyGridProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  events: CalendarEvent[];
  colors: Record<EventOwner, { bg: string; text: string; panel: string }>;
  setViewMode: (mode: "daily" | "monthly") => void;
  showMe: boolean;
  showPartner: boolean;
  showUs: boolean;
}

export default function MonthlyGrid({
  selectedDate,
  setSelectedDate,
  events,
  colors,
  setViewMode,
  showMe,
  showPartner,
  showUs,
}: MonthlyGridProps) {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDaysHeader = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setViewMode("daily");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/30 p-2 pb-[100px] md:pb-2">
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
          {weekDaysHeader.map((day) => (
            <div
              key={day}
              className="py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {days.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentToday = isToday(day);

            const dayStr = format(day, "yyyy-MM-dd");
            const dayEvents = events.filter((e) => {
              if (e.dateStr !== dayStr) return false;
              if (e.owner === "me" && !showMe) return false;
              if (e.owner === "partner" && !showPartner) return false;
              if (e.owner === "us" && !showUs) return false;
              return true;
            }).sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <div
                key={day.toString()}
                onClick={() => handleDayClick(day)}
                className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors hover:bg-gray-50 flex flex-col
                  ${!isCurrentMonth ? "bg-gray-50/50" : "bg-white"}
                  ${idx % 7 === 6 ? "border-r-0" : ""}
                `}
              >
                {/* Date Number */}
                <div className="flex justify-end mb-1">
                  <div
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full transition-all
                      ${
                        isCurrentToday
                          ? "bg-primary text-white font-bold shadow-sm"
                          : isSelected
                            ? "bg-gray-900 text-white font-bold"
                            : !isCurrentMonth
                              ? "text-gray-300"
                              : "text-gray-700"
                      }
                    `}
                  >
                    {format(day, "d")}
                  </div>
                </div>

                {/* Events Preview */}
                <div className="flex flex-col gap-1 flex-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded shadow-sm truncate font-medium ${colors[event.owner].bg} ${colors[event.owner].text}`}
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-gray-500 font-medium px-1 mt-auto">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
