/**
 * Firestore repo against the emulator (admin SDK, rules bypassed):
 *   npm run test:repo
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createFirestoreRepo } from "../src/firestoreRepo";

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-cagie" }, "repo-test");
const db = getFirestore(app);
const repo = createFirestoreRepo(db);
const NOW = 1_000;

beforeEach(async () => {
  await Promise.all(["waLinks", "waLinkCodes", "users"].map(async (c) => {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }));
  await db.doc("users/alice").set({ name: "Alice", coupleId: "c1" });
});
afterAll(async () => deleteApp(app));

describe("firestoreRepo", () => {
  it("relinking the same number works and keeps one link", async () => {
    await db.doc("waLinkCodes/AAA222").set({ uid: "alice", coupleId: "c1", expiresAt: NOW + 10 });
    await repo.consumeLinkCode("AAA222", "alice", "c1", ["h1", "h2"], NOW);
    await db.doc("waLinkCodes/BBB333").set({ uid: "alice", coupleId: "c1", expiresAt: NOW + 10 });
    await repo.consumeLinkCode("BBB333", "alice", "c1", ["h1"], NOW);
    expect((await db.doc("waLinks/h1").get()).get("uid")).toBe("alice");
    expect((await db.doc("waLinks/h2").get()).exists).toBe(false);
    expect((await db.doc("users/alice").get()).get("whatsappLinkedAt")).toBe(NOW);
    await repo.deleteLinksForUid("alice");
    expect((await db.doc("waLinks/h1").get()).exists).toBe(false);
    expect((await db.doc("users/alice").get()).get("whatsappLinkedAt")).toBeUndefined();
  });

  it("commit writes the event and the audit entry together", async () => {
    const id = await repo.commit("c1", { kind: "create", data: { title: "X", description: "", dateStr: "2026-10-21", startTime: "09:00", endTime: "10:00", allDay: false, owner: "me", ownerId: "alice" } }, { uid: "alice", action: "create" });
    expect((await db.doc(`couples/c1/events/${id}`).get()).get("title")).toBe("X");
    const audit = await db.collection("couples/c1/botAudit").where("eventId", "==", id).get();
    expect(audit.size).toBe(1);
    await repo.commit("c1", { kind: "delete", id }, { uid: "alice", action: "delete" });
    expect((await db.doc(`couples/c1/events/${id}`).get()).exists).toBe(false);
  });
});
