// HTTP routing for the WhatsApp assistant API. Firestore access goes through ScheduleRepo,
// so this file is unit tested with an in-memory fake (see scheduleHandler.test.ts).
import { createHash, timingSafeEqual } from "crypto";
import { codeUsable, failedAttemptsAllowed, hashJid, normalizeCode } from "./linkCore";
import {
  EventInput, StoredEvent, buildUpdated, canModify, listForActor, toStored, todayIn, validateInput, validRange,
  withSkippedOccurrence,
} from "./scheduleCore";

type NewEvent = Omit<StoredEvent, "id">;

export interface ScheduleRepo {
  findLink(hash: string): Promise<{ uid: string; coupleId: string } | null>;
  getLinkCode(code: string): Promise<{ uid: string; coupleId: string; expiresAt: number } | null>;
  /** Deletes the code, removes the uid's previous links and stores the new ones, atomically. */
  consumeLinkCode(code: string, uid: string, coupleId: string, hashes: string[], now: number): Promise<void>;
  getFailedAttempts(hash: string): Promise<number[]>;
  setFailedAttempts(hash: string, timestamps: number[]): Promise<void>;
  deleteLinksForUid(uid: string): Promise<void>;
  getUserNames(uid: string, coupleId: string): Promise<{ name: string; partnerName: string | null }>;
  listEvents(coupleId: string): Promise<StoredEvent[]>;
  getEvent(coupleId: string, id: string): Promise<StoredEvent | null>;
  createEvent(coupleId: string, data: NewEvent): Promise<string>;
  /** Replaces the whole document. */
  updateEvent(coupleId: string, id: string, data: NewEvent): Promise<void>;
  deleteEvent(coupleId: string, id: string): Promise<void>;
  audit(coupleId: string, entry: Record<string, unknown>): Promise<void>;
}

export interface HttpReq {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface HttpRes {
  status: number;
  body: unknown;
}

interface Deps {
  repo: ScheduleRepo;
  token: string;
  salt: string;
  tz: string;
  now: () => Date;
}

const INPUT_KEYS = ["title", "date", "start", "end", "allDay", "owner", "repeat", "repeatDays", "repeatUntil"] as const;
const MAX_JIDS = 4;

const json = (status: number, body: unknown): HttpRes => ({ status, body });
const bad = (error: string) => json(400, { error });

const sha = (s: string) => createHash("sha256").update(s).digest();
function tokenMatches(header: string | undefined, token: string): boolean {
  const given = /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1] ?? "";
  // Compare fixed-length digests so neither length nor content leaks through timing.
  return !!token && timingSafeEqual(sha(given), sha(token));
}

/** Only known fields; anything else in the body (ownerId, description, ...) is ignored. */
function pickInput(body: unknown): EventInput {
  const src = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const k of INPUT_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out as EventInput;
}

function withoutId(e: StoredEvent): NewEvent {
  const { id: _id, ...rest } = e;
  void _id;
  return rest;
}

export function createScheduleHandler({ repo, token, salt, tz, now }: Deps) {
  async function audit(coupleId: string, uid: string, action: string, eventId: string, before: unknown, after: unknown) {
    await repo.audit(coupleId, { ts: now().getTime(), uid, action, eventId, before, after, via: "wa-agent" });
  }

  async function link(body: unknown): Promise<HttpRes> {
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const jids = Array.isArray(b.jids) ? b.jids : [];
    const valid = jids.length > 0 && jids.length <= MAX_JIDS &&
      jids.every((j) => typeof j === "string" && j.trim() && j.length <= 100);
    if (typeof b.code !== "string" || !valid) return bad("code and jids are required");

    const t = now().getTime();
    const attemptKey = hashJid(salt, jids[0] as string);
    const attempts = failedAttemptsAllowed(await repo.getFailedAttempts(attemptKey), t);
    if (!attempts.allowed) return json(429, { error: "too_many_attempts" });

    const code = normalizeCode(b.code);
    const doc = await repo.getLinkCode(code);
    if (!doc || !codeUsable(doc, t)) {
      await repo.setFailedAttempts(attemptKey, [...attempts.kept, t]);
      return bad("invalid_code");
    }
    const hashes = [...new Set((jids as string[]).map((j) => hashJid(salt, j)))];
    await repo.consumeLinkCode(code, doc.uid, doc.coupleId, hashes, t);
    const { name } = await repo.getUserNames(doc.uid, doc.coupleId);
    return json(200, { name });
  }

  async function route(req: HttpReq): Promise<HttpRes> {
    const path = req.path.replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();
    const eventMatch = /^\/events\/([^/]+)$/.exec(path);
    const known = ["/link", "/unlink", "/me", "/events"].includes(path) || !!eventMatch;
    if (!known) return json(404, { error: "not_found" });

    if (path === "/link") return method === "POST" ? link(req.body) : json(405, { error: "method_not_allowed" });

    const jid = req.headers["x-actor-jid"] ?? "";
    const actor = jid ? await repo.findLink(hashJid(salt, jid)) : null;
    if (!actor) return json(403, { error: "not_linked" });
    const { uid, coupleId } = actor;
    const today = todayIn(tz, now());

    if (path === "/unlink") {
      if (method !== "POST") return json(405, { error: "method_not_allowed" });
      await repo.deleteLinksForUid(uid);
      return json(200, { ok: true });
    }
    if (path === "/me") {
      if (method !== "GET") return json(405, { error: "method_not_allowed" });
      return json(200, await repo.getUserNames(uid, coupleId));
    }
    if (path === "/events") {
      if (method === "GET") {
        const { from = "", to = "" } = req.query;
        if (!validRange(from, to)) return bad("from/to must be dates at most 31 days apart");
        return json(200, { tz, today, events: listForActor(await repo.listEvents(coupleId), uid, from, to) });
      }
      if (method === "POST") {
        const checked = validateInput(pickInput(req.body), today, "create");
        if (!checked.ok) return bad(checked.error);
        const data = toStored(checked.value, uid);
        const id = await repo.createEvent(coupleId, data);
        await audit(coupleId, uid, "create", id, null, data);
        return json(200, { id });
      }
      return json(405, { error: "method_not_allowed" });
    }

    // /events/:id
    const id = decodeURIComponent(eventMatch![1]);
    if (method !== "PATCH" && method !== "DELETE") return json(405, { error: "method_not_allowed" });
    const current = await repo.getEvent(coupleId, id);
    if (!current) return json(404, { error: "not_found" });
    if (!canModify(current, uid)) return json(403, { error: "forbidden" });

    if (method === "PATCH") {
      const input = validateInput(pickInput(req.body), today, "update");
      if (!input.ok) return bad(input.error);
      const updated = buildUpdated(current, input.value, uid, today);
      if (!updated.ok) return bad(updated.error);
      await repo.updateEvent(coupleId, id, updated.value);
      await audit(coupleId, uid, "update", id, withoutId(current), updated.value);
      return json(200, { ok: true });
    }

    const occurrence = req.query.occurrence;
    if (occurrence) {
      if (!current.repeatType || current.repeatType === "none") return bad("not a repeating event");
      if (!validRange(occurrence, occurrence)) return bad("occurrence must be YYYY-MM-DD");
      const after = { ...withoutId(current), ...withSkippedOccurrence(current, occurrence) };
      await repo.updateEvent(coupleId, id, after);
      await audit(coupleId, uid, "skip", id, withoutId(current), after);
      return json(200, { ok: true });
    }
    await repo.deleteEvent(coupleId, id);
    await audit(coupleId, uid, "delete", id, withoutId(current), null);
    return json(200, { ok: true });
  }

  return async function handle(req: HttpReq): Promise<HttpRes> {
    if (!tokenMatches(req.headers.authorization, token)) return { status: 401, body: "" };
    try {
      return await route(req);
    } catch (err) {
      console.error("scheduleApi error", err);
      return json(500, { error: "internal" });
    }
  };
}
