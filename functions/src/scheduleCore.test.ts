import { describe, expect, it } from "vitest";
import {
  buildUpdated, canModify, listForActor, todayIn, toStored, validateInput, validRange, withSkippedOccurrence,
  type StoredEvent,
} from "./scheduleCore";

const ME = "uid-me";
const PARTNER = "uid-partner";
const ev = (over: Partial<StoredEvent>): StoredEvent => ({
  id: "e1", title: "T", description: "secret", dateStr: "2026-10-21", startTime: "09:00", endTime: "10:00",
  allDay: false, owner: "me", ownerId: ME, ...over,
});

describe("todayIn", () => {
  it("uses the Jakarta date near midnight", () => {
    expect(todayIn("Asia/Jakarta", new Date("2026-10-20T16:30:00Z"))).toBe("2026-10-20");
    expect(todayIn("Asia/Jakarta", new Date("2026-10-20T17:30:00Z"))).toBe("2026-10-21");
  });
});

describe("listForActor", () => {
  const events: StoredEvent[] = [
    ev({ id: "mine" }),
    ev({ id: "ours", ownerId: "us", owner: "us", dateStr: "2026-10-22" }),
    ev({ id: "theirs", ownerId: PARTNER, owner: "me", dateStr: "2026-10-22" }),
    ev({
      id: "weekly", dateStr: "2026-10-19", repeatType: "weekly", repeatDays: [1], ownerId: "us", owner: "us",
      exceptions: { "2026-10-26": { deleted: true }, "2026-11-02": { ownerId: PARTNER, owner: "partner" } },
    }),
  ];
  const out = listForActor(events, ME, "2026-10-19", "2026-11-09");

  it("returns own, shared and (read-only) partner events", () => {
    const ids = out.map((e) => `${e.id}${e.occurrence ? "@" + e.occurrence : ""}`);
    expect(ids).toContain("mine");
    expect(ids).toContain("ours");
    expect(out.find((e) => e.id === "theirs")?.owner).toBe("partner");
  });
  it("expands repeats, skips deleted occurrences, marks reassigned ones as the partner's", () => {
    const weekly = out.filter((e) => e.id === "weekly").map((e) => `${e.occurrence}:${e.owner}`);
    expect(weekly).toEqual(["2026-10-19:us", "2026-11-02:partner", "2026-11-09:us"]);
  });
  it("never includes descriptions and maps owner", () => {
    expect(JSON.stringify(out)).not.toContain("secret");
    expect(out.find((e) => e.id === "mine")?.owner).toBe("me");
    expect(out.find((e) => e.id === "ours")?.owner).toBe("us");
  });
});

describe("validateInput", () => {
  const today = "2026-10-20";
  const base = { title: "Dentist", date: "2026-10-23", start: "14:00", end: "15:00" };
  const bad = (over: object) => validateInput({ ...base, ...over }, today, "create").ok;
  it("accepts a valid timed and all-day event", () => {
    expect(validateInput(base, today, "create").ok).toBe(true);
    expect(validateInput({ title: "Holiday", date: "2026-10-23", allDay: true }, today, "create").ok).toBe(true);
  });
  it("rejects bad fields", () => {
    expect(bad({ title: "  " })).toBe(false);
    expect(bad({ title: "x".repeat(101) })).toBe(false);
    expect(bad({ date: "2026-13-01" })).toBe(false);
    expect(bad({ date: "2029-01-01" })).toBe(false);
    expect(bad({ date: "2025-09-01" })).toBe(false);
    expect(bad({ start: "25:00" })).toBe(false);
    expect(bad({ end: "14:00" })).toBe(false);
    expect(bad({ repeat: "hourly" })).toBe(false);
    expect(bad({ repeat: "weekly", repeatDays: [7] })).toBe(false);
    expect(bad({ repeat: "daily", repeatUntil: "2026-10-01" })).toBe(false);
  });
  it("create needs title, date and times", () => {
    expect(validateInput({ title: "x", date: "2026-10-23" }, today, "create").ok).toBe(false);
  });
});

describe("toStored and buildUpdated", () => {
  it("stores like the app does", () => {
    expect(toStored({ title: " Gym ", date: "2026-10-23", start: "07:00", end: "08:00" }, ME)).toEqual({
      title: "Gym", description: "", dateStr: "2026-10-23", startTime: "07:00", endTime: "08:00",
      allDay: false, owner: "me", ownerId: ME,
    });
    const shared = toStored({ title: "Dinner", date: "2026-10-23", allDay: true, owner: "us", repeat: "weekly", repeatDays: [5, 1] }, ME);
    expect(shared).toMatchObject({ ownerId: "us", owner: "us", startTime: "00:00", endTime: "23:59", repeatType: "weekly", repeatDays: [1, 5] });
  });
  it("buildUpdated merges, keeps description, validates the result", () => {
    const current = ev({ description: "keep" });
    const r = buildUpdated(current, { start: "11:00", end: "12:00" }, ME, "2026-10-20");
    expect(r.ok && r.value).toMatchObject({ startTime: "11:00", endTime: "12:00", description: "keep", title: "T" });
    expect(buildUpdated(current, { start: "11:00" }, ME, "2026-10-20").ok).toBe(false); // end 10:00 before start
  });
});

describe("ownership helpers", () => {
  it("canModify own and shared only", () => {
    expect(canModify(ev({}), ME)).toBe(true);
    expect(canModify(ev({ ownerId: "us" }), ME)).toBe(true);
    expect(canModify(ev({ ownerId: PARTNER }), ME)).toBe(false);
  });
  it("withSkippedOccurrence keeps other exceptions", () => {
    const e = ev({ repeatType: "daily", exceptions: { "2026-10-22": { title: "x" } } });
    expect(withSkippedOccurrence(e, "2026-10-23")).toEqual({
      exceptions: { "2026-10-22": { title: "x" }, "2026-10-23": { deleted: true } },
    });
  });
  it("validRange", () => {
    expect(validRange("2026-10-01", "2026-10-31")).toBe(true);
    expect(validRange("2026-10-01", "2026-11-02")).toBe(false);
    expect(validRange("2026-10-05", "2026-10-01")).toBe(false);
    expect(validRange("bad", "2026-10-01")).toBe(false);
  });
});
