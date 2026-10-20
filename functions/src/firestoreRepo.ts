// Firestore implementation of ScheduleRepo (thin; the logic lives in scheduleHandler/scheduleCore).
import { FieldValue, Firestore } from "firebase-admin/firestore";
import type { ScheduleRepo } from "./scheduleHandler";
import type { StoredEvent } from "./scheduleCore";

/** Firestore rejects `undefined`; drop such keys (recursively) before writing. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]),
    ) as T;
  }
  return value;
}

export function createFirestoreRepo(db: Firestore): ScheduleRepo {
  const links = db.collection("waLinks");
  const codes = db.collection("waLinkCodes");
  const attempts = db.collection("waLinkAttempts");
  const events = (coupleId: string) => db.collection("couples").doc(coupleId).collection("events");

  return {
    async findLink(hash) {
      const snap = await links.doc(hash).get();
      return snap.exists ? { uid: snap.get("uid"), coupleId: snap.get("coupleId") } : null;
    },
    async getLinkCode(code) {
      const snap = await codes.doc(code).get();
      return snap.exists ? { uid: snap.get("uid"), coupleId: snap.get("coupleId"), expiresAt: snap.get("expiresAt") } : null;
    },
    async consumeLinkCode(code, uid, coupleId, hashes, now) {
      await db.runTransaction(async (tx) => {
        const codeRef = codes.doc(code);
        const [codeSnap, old] = await Promise.all([tx.get(codeRef), tx.get(links.where("uid", "==", uid))]);
        if (!codeSnap.exists || codeSnap.get("expiresAt") <= now) throw new Error("link code no longer valid");
        tx.delete(codeRef);
        old.docs.forEach((d) => tx.delete(d.ref));
        hashes.forEach((h) => tx.set(links.doc(h), { uid, coupleId, linkedAt: now }));
        tx.update(db.collection("users").doc(uid), { whatsappLinkedAt: now });
      });
    },
    async getFailedAttempts(hash) {
      const snap = await attempts.doc(hash).get();
      return (snap.get("ts") as number[] | undefined) ?? [];
    },
    async setFailedAttempts(hash, ts) {
      await attempts.doc(hash).set({ ts });
    },
    async deleteLinksForUid(uid) {
      const old = await links.where("uid", "==", uid).get();
      const batch = db.batch();
      old.docs.forEach((d) => batch.delete(d.ref));
      batch.update(db.collection("users").doc(uid), { whatsappLinkedAt: FieldValue.delete() });
      await batch.commit();
    },
    async getUserNames(uid, coupleId) {
      const [me, couple] = await Promise.all([db.collection("users").doc(uid).get(), db.collection("couples").doc(coupleId).get()]);
      const partnerUid = ((couple.get("members") as string[] | undefined) ?? []).find((m) => m !== uid);
      const partner = partnerUid ? await db.collection("users").doc(partnerUid).get() : null;
      return { name: me.get("name") ?? "", partnerName: partner?.get("name") ?? null };
    },
    async listEvents(coupleId) {
      const snap = await events(coupleId).get();
      return snap.docs.map((d) => ({ ...(d.data() as Omit<StoredEvent, "id">), id: d.id }));
    },
    async getEvent(coupleId, id) {
      const snap = await events(coupleId).doc(id).get();
      return snap.exists ? { ...(snap.data() as Omit<StoredEvent, "id">), id: snap.id } : null;
    },
    async createEvent(coupleId, data) {
      const ref = await events(coupleId).add(clean(data));
      return ref.id;
    },
    async updateEvent(coupleId, id, data) {
      await events(coupleId).doc(id).set(clean(data));
    },
    async deleteEvent(coupleId, id) {
      await events(coupleId).doc(id).delete();
    },
    async audit(coupleId, entry) {
      await db.collection("couples").doc(coupleId).collection("botAudit").add(clean(entry));
    },
  };
}
