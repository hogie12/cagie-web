import { describe, expect, it } from "vitest";
import {
  CalendarEvent,
  expandRecurringEvents,
  findClashes,
  layoutDayEvents,
  minutesToTime,
  timeToMinutes,
} from "./recurrence";

const ev = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: overrides.id ?? "e1",
  title: "Event",
  dateStr: "2026-10-01",
  startTime: "10:00",
  endTime: "11:00",
  owner: "me",
  ...overrides,
});

const dates = (events: CalendarEvent[]) => events.map((e) => e.dateStr);

describe("time helpers", () => {
  it("converts both ways and clamps to the day", () => {
    expect(timeToMinutes("07:45")).toBe(465);
    expect(minutesToTime(465)).toBe("07:45");
    expect(minutesToTime(25 * 60)).toBe("23:59");
    expect(minutesToTime(-5)).toBe("00:00");
  });
});

describe("expandRecurringEvents", () => {
  it("filters one-off events to the range", () => {
    const events = [ev({ id: "a", dateStr: "2026-09-30" }), ev({ id: "b", dateStr: "2026-10-02" })];
    expect(dates(expandRecurringEvents(events, "2026-10-01", "2026-10-31"))).toEqual(["2026-10-02"]);
  });

  it("expands daily events within range and until-date", () => {
    const daily = ev({ repeatType: "daily", dateStr: "2026-10-01", repeatUntil: "2026-10-03" });
    expect(dates(expandRecurringEvents([daily], "2026-09-01", "2026-12-31"))).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("has no ±90 day cap: forever events show up far in the future", () => {
    const daily = ev({ repeatType: "daily", dateStr: "2020-01-01" });
    expect(dates(expandRecurringEvents([daily], "2030-05-01", "2030-05-02"))).toEqual([
      "2030-05-01",
      "2030-05-02",
    ]);
  });

  it("expands weekly events on the chosen weekdays only", () => {
    // 2026-10-05 is a Monday.
    const weekly = ev({ repeatType: "weekly", dateStr: "2026-10-05", repeatDays: [1, 3] });
    expect(dates(expandRecurringEvents([weekly], "2026-10-01", "2026-10-14"))).toEqual([
      "2026-10-05",
      "2026-10-07",
      "2026-10-12",
      "2026-10-14",
    ]);
  });

  it("falls back to the start weekday when weekly has no days", () => {
    const weekly = ev({ repeatType: "weekly", dateStr: "2026-10-05" });
    expect(dates(expandRecurringEvents([weekly], "2026-10-01", "2026-10-20"))).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
  });

  it("expands monthly and yearly events", () => {
    const monthly = ev({ id: "m", repeatType: "monthly", dateStr: "2026-01-15" });
    const yearly = ev({ id: "y", repeatType: "yearly", dateStr: "2020-10-14", allDay: true });
    const result = expandRecurringEvents([monthly, yearly], "2026-09-01", "2026-11-30");
    expect(result.filter((e) => e.originalEventId === "m").map((e) => e.dateStr)).toEqual([
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
    ]);
    expect(result.filter((e) => e.originalEventId === "y").map((e) => e.dateStr)).toEqual(["2026-10-14"]);
  });

  it("applies exceptions and skips deleted occurrences", () => {
    const daily = ev({
      repeatType: "daily",
      dateStr: "2026-10-01",
      repeatUntil: "2026-10-03",
      exceptions: {
        "2026-10-02": { title: "Moved", startTime: "15:00", endTime: "16:00", owner: "partner" },
        "2026-10-03": { deleted: true },
      },
    });
    const result = expandRecurringEvents([daily], "2026-10-01", "2026-10-31");
    expect(dates(result)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(result[1]).toMatchObject({
      id: "e1_2026-10-02",
      originalEventId: "e1",
      isOccurrence: true,
      title: "Moved",
      startTime: "15:00",
      owner: "partner",
    });
  });

  it("sorts by date, all-day first, then start time", () => {
    const events = [
      ev({ id: "late", startTime: "18:00", endTime: "19:00" }),
      ev({ id: "allday", allDay: true, startTime: "00:00", endTime: "23:59" }),
      ev({ id: "early", startTime: "08:00", endTime: "09:00" }),
    ];
    expect(expandRecurringEvents(events, "2026-10-01", "2026-10-01").map((e) => e.id)).toEqual([
      "allday",
      "early",
      "late",
    ]);
  });
});

describe("findClashes", () => {
  const day = [
    ev({ id: "mine", owner: "me", startTime: "10:00", endTime: "11:00" }),
    ev({ id: "theirs", owner: "partner", startTime: "10:00", endTime: "11:00" }),
    ev({ id: "ours", owner: "us", startTime: "12:00", endTime: "13:00" }),
    ev({ id: "allday", owner: "me", allDay: true, startTime: "00:00", endTime: "23:59" }),
  ];

  it("only reports overlaps in a shared column", () => {
    const clashes = findClashes({ owner: "me", startTime: "10:30", endTime: "12:30" }, day);
    expect(clashes.map((e) => e.id)).toEqual(["mine", "ours"]);
  });

  it("treats touching events as not overlapping", () => {
    expect(findClashes({ owner: "me", startTime: "11:00", endTime: "12:00" }, day)).toEqual([]);
  });

  it("ignores the event being edited, including its series", () => {
    const occurrence = ev({ id: "s_2026-10-01", originalEventId: "s", owner: "me" });
    expect(findClashes({ owner: "me", startTime: "10:00", endTime: "11:00" }, [occurrence], ["s"])).toEqual([]);
  });

  it("never reports clashes for all-day events", () => {
    expect(findClashes({ owner: "us", allDay: true, startTime: "00:00", endTime: "23:59" }, day)).toEqual([]);
  });
});

describe("layoutDayEvents", () => {
  it("keeps owners in their lanes when nothing collides", () => {
    const layout = layoutDayEvents([
      ev({ id: "a", owner: "me" }),
      ev({ id: "b", owner: "partner" }),
      ev({ id: "c", owner: "us", startTime: "12:00", endTime: "13:00" }),
    ]);
    const byId = Object.fromEntries(layout.map((l) => [l.event.id, l]));
    expect(byId.a).toMatchObject({ left: 0, width: 0.5 });
    expect(byId.b).toMatchObject({ left: 0.5, width: 0.5 });
    expect(byId.c).toMatchObject({ left: 0, width: 1 });
  });

  it("packs colliding events side by side without overlap", () => {
    const layout = layoutDayEvents([
      ev({ id: "a", owner: "me", startTime: "12:30", endTime: "13:30" }),
      ev({ id: "b", owner: "us", startTime: "13:00", endTime: "14:00" }),
      ev({ id: "c", owner: "partner", startTime: "12:00", endTime: "13:00" }),
    ]);
    for (const x of layout) {
      for (const y of layout) {
        if (x === y) continue;
        const timeOverlap =
          timeToMinutes(x.event.startTime) < timeToMinutes(y.event.endTime) &&
          timeToMinutes(y.event.startTime) < timeToMinutes(x.event.endTime);
        const spaceOverlap = x.left < y.left + y.width - 1e-9 && y.left < x.left + x.width - 1e-9;
        expect(timeOverlap && spaceOverlap).toBe(false);
      }
    }
    const byId = Object.fromEntries(layout.map((l) => [l.event.id, l]));
    expect(byId.a.left).toBeLessThan(byId.c.left); // "me" stays left of "partner"
  });

  it("excludes all-day events", () => {
    expect(layoutDayEvents([ev({ allDay: true })])).toEqual([]);
  });
});
