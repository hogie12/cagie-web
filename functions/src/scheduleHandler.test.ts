import { beforeEach, describe, expect, it } from "vitest";
import { createScheduleHandler, type HttpReq, type ScheduleRepo } from "./scheduleHandler";
import { hashJid } from "./linkCore";
import type { StoredEvent } from "./scheduleCore";

const TOKEN = "t0ken";
const SALT = "salt";
const ME = "uid-me";
const PARTNER = "uid-partner";
const COUPLE = "c1";
const JID = "6281@s.whatsapp.net";
const NOW = new Date("2026-10-20T03:00:00Z"); // 10:00 in Jakarta

function fakeRepo() {
  const s = {
    links: new Map<string, { uid: string; coupleId: string }>(),
    codes: new Map<string, { uid: string; coupleId: string; expiresAt: number }>(),
    attempts: new Map<string, number[]>(),
    events: new Map<string, StoredEvent>(),
    audit: [] as Record<string, unknown>[],
    writes: 0,
    nextId: 1,
  };
  const repo: ScheduleRepo = {
    async findLink(h) { return s.links.get(h) ?? null; },
    async getLinkCode(c) { return s.codes.get(c) ?? null; },
    async consumeLinkCode(code, uid, coupleId, hashes) {
      s.codes.delete(code);
      for (const [h, l] of [...s.links]) if (l.uid === uid) s.links.delete(h);
      for (const h of hashes) s.links.set(h, { uid, coupleId });
    },
    async getFailedAttempts(h) { return s.attempts.get(h) ?? []; },
    async setFailedAttempts(h, ts) { s.attempts.set(h, ts); },
    async deleteLinksForUid(uid) { for (const [h, l] of [...s.links]) if (l.uid === uid) s.links.delete(h); },
    async getUserNames(uid) { return uid === ME ? { name: "Hogie", partnerName: "Partner" } : { name: "?", partnerName: null }; },
    async listEvents() { return [...s.events.values()]; },
    async getEvent(_c, id) { return s.events.get(id) ?? null; },
    async createEvent(_c, data) { const id = `n${s.nextId++}`; s.events.set(id, { ...data, id } as StoredEvent); s.writes++; return id; },
    async updateEvent(_c, id, data) { s.events.set(id, { ...data, id } as StoredEvent); s.writes++; },
    async deleteEvent(_c, id) { s.events.delete(id); s.writes++; },
    async audit(_c, entry) { s.audit.push(entry); },
  };
  return { s, repo };
}

let s: ReturnType<typeof fakeRepo>["s"];
let handle: (r: HttpReq) => Promise<{ status: number; body: unknown }>;
const req = (method: string, path: string, opts: Partial<HttpReq> = {}): HttpReq => ({
  method, path, query: {}, body: undefined,
  headers: { authorization: `Bearer ${TOKEN}`, "x-actor-jid": JID },
  ...opts,
});
const linkMe = () => s.links.set(hashJid(SALT, JID), { uid: ME, coupleId: COUPLE });
const base = { title: "T", description: "d", dateStr: "2026-10-21", startTime: "09:00", endTime: "10:00", allDay: false };

beforeEach(() => {
  const f = fakeRepo();
  s = f.s;
  handle = createScheduleHandler({ repo: f.repo, token: TOKEN, salt: SALT, tz: "Asia/Jakarta", now: () => NOW });
  s.events.set("mine", { ...base, id: "mine", owner: "me", ownerId: ME });
  s.events.set("theirs", { ...base, id: "theirs", owner: "me", ownerId: PARTNER });
  s.events.set("daily", { ...base, id: "daily", owner: "us", ownerId: "us", repeatType: "daily" });
});

describe("auth", () => {
  it("rejects a wrong or missing token with an empty body", async () => {
    expect(await handle(req("GET", "/me", { headers: { authorization: "Bearer nope", "x-actor-jid": JID } }))).toEqual({ status: 401, body: "" });
    expect((await handle(req("GET", "/me", { headers: {} }))).status).toBe(401);
  });
  it("unknown actor is not_linked", async () => {
    expect(await handle(req("GET", "/me"))).toEqual({ status: 403, body: { error: "not_linked" } });
  });
  it("unknown path 404, wrong method 405", async () => {
    linkMe();
    expect((await handle(req("GET", "/nope"))).status).toBe(404);
    expect((await handle(req("PUT", "/events"))).status).toBe(405);
  });
});

describe("/link and /unlink", () => {
  beforeEach(() => s.codes.set("ABC234", { uid: ME, coupleId: COUPLE, expiresAt: NOW.getTime() + 60_000 }));
  it("links every jid, consumes the code, returns the name", async () => {
    const r = await handle(req("POST", "/link", { body: { code: " abc 234 ", jids: [JID, "99@lid"] } }));
    expect(r).toEqual({ status: 200, body: { name: "Hogie" } });
    expect(s.links.get(hashJid(SALT, "99@lid"))?.uid).toBe(ME);
    expect((await handle(req("POST", "/link", { body: { code: "ABC234", jids: [JID] } }))).status).toBe(400);
  });
  it("expired code is rejected", async () => {
    s.codes.set("ABC234", { uid: ME, coupleId: COUPLE, expiresAt: NOW.getTime() - 1 });
    expect((await handle(req("POST", "/link", { body: { code: "ABC234", jids: [JID] } }))).status).toBe(400);
  });
  it("sixth failed attempt in an hour is rate limited", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await handle(req("POST", "/link", { body: { code: "WRONG2", jids: [JID] } }))).status).toBe(400);
    }
    expect((await handle(req("POST", "/link", { body: { code: "ABC234", jids: [JID] } }))).status).toBe(429);
  });
  it("bad body is 400", async () => {
    expect((await handle(req("POST", "/link", { body: { code: "ABC234" } }))).status).toBe(400);
  });
  it("unlink removes the links", async () => {
    linkMe();
    expect((await handle(req("POST", "/unlink"))).status).toBe(200);
    expect((await handle(req("GET", "/me"))).status).toBe(403);
  });
});

describe("events", () => {
  beforeEach(linkMe);
  it("/me", async () => {
    expect(await handle(req("GET", "/me"))).toEqual({ status: 200, body: { name: "Hogie", partnerName: "Partner" } });
  });
  it("lists own and shared only, validates range", async () => {
    const r = await handle(req("GET", "/events", { query: { from: "2026-10-21", to: "2026-10-22" } }));
    const ids = (r.body as { events: { id: string }[] }).events.map((e) => e.id);
    expect(ids).toContain("mine");
    expect(ids).toContain("daily");
    expect(ids).not.toContain("theirs");
    expect((await handle(req("GET", "/events", { query: { from: "2026-10-01", to: "2026-11-05" } }))).status).toBe(400);
  });
  it("creates with stored fields and one audit entry; ignores ownerId in the body", async () => {
    const r = await handle(req("POST", "/events", { body: { title: "Gym", date: "2026-10-23", start: "07:00", end: "08:00", ownerId: PARTNER } }));
    expect(r.status).toBe(200);
    const id = (r.body as { id: string }).id;
    expect(s.events.get(id)).toMatchObject({ title: "Gym", ownerId: ME, owner: "me", dateStr: "2026-10-23" });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ action: "create", uid: ME, eventId: id, via: "wa-agent" });
  });
  it("invalid create is 400 with no write and no audit", async () => {
    const r = await handle(req("POST", "/events", { body: { title: "", date: "2026-10-23", start: "07:00", end: "08:00" } }));
    expect(r.status).toBe(400);
    expect(s.writes).toBe(0);
    expect(s.audit).toHaveLength(0);
  });
  it("cannot touch the partner's events", async () => {
    expect((await handle(req("PATCH", "/events/theirs", { body: { title: "x" } }))).status).toBe(403);
    expect((await handle(req("DELETE", "/events/theirs"))).status).toBe(403);
    expect(s.writes).toBe(0);
  });
  it("updates own event with before/after audit", async () => {
    const r = await handle(req("PATCH", "/events/mine", { body: { start: "11:00", end: "12:00" } }));
    expect(r.status).toBe(200);
    expect(s.events.get("mine")).toMatchObject({ startTime: "11:00", endTime: "12:00", description: "d" });
    expect(s.audit[0]).toMatchObject({ action: "update", before: { startTime: "09:00" }, after: { startTime: "11:00" } });
  });
  it("invalid update is 400 and writes nothing", async () => {
    expect((await handle(req("PATCH", "/events/mine", { body: { end: "08:00" } }))).status).toBe(400);
    expect(s.writes).toBe(0);
  });
  it("delete with occurrence skips that day; plain delete removes; unknown 404", async () => {
    expect((await handle(req("DELETE", "/events/daily", { query: { occurrence: "2026-10-22" } }))).status).toBe(200);
    expect(s.events.get("daily")?.exceptions).toEqual({ "2026-10-22": { deleted: true } });
    expect(s.audit.at(-1)).toMatchObject({ action: "skip" });
    expect((await handle(req("DELETE", "/events/mine", { query: { occurrence: "2026-10-22" } }))).status).toBe(400);
    expect((await handle(req("DELETE", "/events/mine"))).status).toBe(200);
    expect(s.events.has("mine")).toBe(false);
    expect((await handle(req("DELETE", "/events/ghost"))).status).toBe(404);
  });
});
