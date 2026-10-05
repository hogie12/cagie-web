/**
 * Security rules tests. Run against the emulators:
 *   npm run test:rules
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-cagie";
const COUPLE = "couple1";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { email: "a@x.com", name: "Alice", coupleId: COUPLE });
    await setDoc(doc(db, "users/bob"), { email: "b@x.com", name: "Bob", coupleId: COUPLE });
    await setDoc(doc(db, "users/eve"), { email: "e@x.com", name: "Eve", coupleId: null });
    await setDoc(doc(db, `couples/${COUPLE}`), { members: ["alice", "bob"] });
    await setDoc(doc(db, `couples/${COUPLE}/notes/n1`), { text: "hi", createdBy: "alice", x: 0, y: 0 });
    await setDoc(doc(db, `couples/${COUPLE}/dashboard/main`), {
      greetings: { bob: { text: "hey", updatedAt: 1 } },
    });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("users", () => {
  it("lets a user create their own profile without a couple", async () => {
    await assertSucceeds(setDoc(doc(as("newbie"), "users/newbie"), { email: "n@x.com", name: "N", coupleId: null }));
  });

  it("blocks creating a profile that claims a couple", async () => {
    await assertFails(setDoc(doc(as("newbie"), "users/newbie"), { email: "n@x.com", coupleId: COUPLE }));
  });

  it("blocks setting anyone's coupleId from the client (old precedence bug)", async () => {
    await assertFails(updateDoc(doc(as("eve"), "users/alice"), { coupleId: "evil" }));
    await assertFails(updateDoc(doc(as("eve"), "users/eve"), { coupleId: COUPLE }));
  });

  it("lets a user edit their own name/photo/tokens only", async () => {
    await assertSucceeds(updateDoc(doc(as("alice"), "users/alice"), { name: "Ally", fcmTokens: ["t"] }));
    await assertFails(updateDoc(doc(as("bob"), "users/alice"), { name: "Hacked" }));
  });

  it("lets partners read each other but not strangers", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "users/bob")));
    await assertFails(getDoc(doc(as("eve"), "users/alice")));
    await assertFails(getDoc(doc(as("alice"), "users/eve")));
  });
});

describe("couples", () => {
  it("is readable by members only", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), `couples/${COUPLE}`)));
    await assertFails(getDoc(doc(as("eve"), `couples/${COUPLE}`)));
  });

  it("cannot be joined or created from the client", async () => {
    await assertFails(updateDoc(doc(as("eve"), `couples/${COUPLE}`), { members: ["alice", "bob", "eve"] }));
    await assertFails(setDoc(doc(as("eve"), "couples/mine"), { members: ["eve"] }));
  });

  it("shares events with members only", async () => {
    const ev = { title: "Dinner", dateStr: "2026-10-02", startTime: "19:00", endTime: "20:00" };
    await assertSucceeds(setDoc(doc(as("alice"), `couples/${COUPLE}/events/e1`), ev));
    await assertSucceeds(getDoc(doc(as("bob"), `couples/${COUPLE}/events/e1`)));
    await assertFails(getDoc(doc(as("eve"), `couples/${COUPLE}/events/e1`)));
    await assertFails(setDoc(doc(as("eve"), `couples/${COUPLE}/events/e2`), ev));
  });
});

describe("notes", () => {
  it("must be created as yourself", async () => {
    await assertSucceeds(setDoc(doc(as("bob"), `couples/${COUPLE}/notes/n2`), { text: "x", createdBy: "bob" }));
    await assertFails(setDoc(doc(as("bob"), `couples/${COUPLE}/notes/n3`), { text: "x", createdBy: "alice" }));
  });

  it("can be moved by either partner but deleted only by the author", async () => {
    await assertSucceeds(updateDoc(doc(as("bob"), `couples/${COUPLE}/notes/n1`), { x: 10, y: 20 }));
    await assertFails(updateDoc(doc(as("bob"), `couples/${COUPLE}/notes/n1`), { createdBy: "bob" }));
    await assertFails(deleteDoc(doc(as("bob"), `couples/${COUPLE}/notes/n1`)));
    await assertSucceeds(deleteDoc(doc(as("alice"), `couples/${COUPLE}/notes/n1`)));
  });
});

describe("dashboard", () => {
  const main = (uid: string) => doc(as(uid), `couples/${COUPLE}/dashboard/main`);

  it("lets each partner write only their own greeting / photo", async () => {
    await assertSucceeds(
      setDoc(main("alice"), { greetings: { alice: { text: "hi", updatedAt: 2 } } }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(main("alice"), { paps: { alice: { url: "u", updatedAt: 2 } } }, { merge: true }),
    );
    await assertFails(
      setDoc(main("alice"), { greetings: { bob: { text: "fake", updatedAt: 3 } } }, { merge: true }),
    );
    await assertFails(setDoc(main("alice"), { other: true }, { merge: true }));
    await assertFails(setDoc(main("eve"), { greetings: { eve: { text: "x", updatedAt: 1 } } }, { merge: true }));
  });

  it("still accepts own entries when an older app left extra fields on the doc", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `couples/${COUPLE}/dashboard/main`), {
        greetings: { bob: { text: "hey", updatedAt: 1 } },
        lastUpdated: 123,
      });
    });
    await assertSucceeds(
      setDoc(main("alice"), { greetings: { alice: { text: "hi", updatedAt: 2 } } }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(main("alice"), { paps: { alice: { url: "u", updatedAt: 2 } } }, { merge: true }),
    );
    await assertFails(setDoc(main("alice"), { lastUpdated: 999 }, { merge: true }));
    await assertFails(
      setDoc(main("alice"), { greetings: { bob: { text: "fake", updatedAt: 3 } } }, { merge: true }),
    );
  });

  it("only allows a fresh doc with greetings / paps", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `couples/${COUPLE}/dashboard/main`));
    });
    await assertFails(setDoc(main("alice"), { greetings: { alice: { text: "hi", updatedAt: 1 } }, extra: 1 }));
    await assertSucceeds(setDoc(main("alice"), { greetings: { alice: { text: "hi", updatedAt: 1 } } }));
  });
});

describe("private collections", () => {
  it("hides invite codes and history writes", async () => {
    await assertFails(getDoc(doc(as("alice"), "inviteCodes/ABC123")));
    await assertFails(setDoc(doc(as("alice"), "inviteCodes/ABC123"), { uid: "alice" }));
    await assertFails(setDoc(doc(as("alice"), `couples/${COUPLE}/history/h1`), { type: "greeting" }));
  });
});

describe("storage", () => {
  const png = new Uint8Array([137, 80, 78, 71]);

  it("accepts couple photos from members only, images only", async () => {
    const alice = env.authenticatedContext("alice").storage();
    const eve = env.authenticatedContext("eve").storage();
    await assertSucceeds(uploadBytes(ref(alice, `couples/${COUPLE}/pap_1.png`), png, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(alice, `couples/${COUPLE}/evil.html`), png, { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(eve, `couples/${COUPLE}/pap_2.png`), png, { contentType: "image/png" }));
  });

  it("lets users upload only their own avatar", async () => {
    const alice = env.authenticatedContext("alice").storage();
    await assertSucceeds(uploadBytes(ref(alice, "users/alice/avatar.jpg"), png, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(alice, "users/bob/avatar.jpg"), png, { contentType: "image/jpeg" }));
  });
});
