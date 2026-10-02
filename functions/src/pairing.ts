import { randomInt } from "crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const REGION = "asia-southeast2";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_LENGTH = 6;
const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_HOUR = 10;

const db = () => getFirestore();

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Please sign in first.");
  return auth.uid;
}

/** Returns the caller's active invite code, creating one if needed. */
export const getInviteCode = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);

  const userSnap = await db().collection("users").doc(uid).get();
  if (userSnap.get("coupleId")) {
    return { code: null, paired: true };
  }

  const now = Date.now();
  const existing = await db()
    .collection("inviteCodes")
    .where("uid", "==", uid)
    .get();

  const valid = existing.docs.find((d) => d.get("expiresAt") > now);
  const batch = db().batch();
  existing.docs
    .filter((d) => d.id !== valid?.id)
    .forEach((d) => batch.delete(d.ref));
  await batch.commit();

  if (valid) {
    return { code: valid.id, expiresAt: valid.get("expiresAt"), paired: false };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = db().collection("inviteCodes").doc(code);
    try {
      await ref.create({ uid, createdAt: now, expiresAt: now + CODE_TTL_MS });
      return { code, expiresAt: now + CODE_TTL_MS, paired: false };
    } catch {
      // Code collision: try another one.
    }
  }
  throw new HttpsError("internal", "Could not create an invite code. Try again.");
});

/** Pairs the caller with the owner of `code`. */
export const pairWithCode = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const raw = typeof request.data?.code === "string" ? request.data.code : "";
  const code = raw.trim().toUpperCase();
  if (code.length !== CODE_LENGTH || [...code].some((c) => !CODE_ALPHABET.includes(c))) {
    throw new HttpsError("invalid-argument", "That code doesn't look right.");
  }

  // Simple per-user rate limit to stop code guessing.
  const attemptsRef = db().collection("pairAttempts").doc(uid);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(attemptsRef);
    const now = Date.now();
    const windowStart: number = snap.get("windowStart") ?? 0;
    const count: number = snap.get("count") ?? 0;
    if (now - windowStart > 60 * 60 * 1000) {
      tx.set(attemptsRef, { windowStart: now, count: 1 });
    } else if (count >= MAX_ATTEMPTS_PER_HOUR) {
      throw new HttpsError("resource-exhausted", "Too many attempts. Try again in an hour.");
    } else {
      tx.update(attemptsRef, { count: count + 1 });
    }
  });

  const coupleId = await db().runTransaction(async (tx) => {
    const codeRef = db().collection("inviteCodes").doc(code);
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists || codeSnap.get("expiresAt") <= Date.now()) {
      throw new HttpsError("not-found", "Invalid or expired code.");
    }

    const partnerUid: string = codeSnap.get("uid");
    if (partnerUid === uid) {
      throw new HttpsError("invalid-argument", "You can't use your own code.");
    }

    const meRef = db().collection("users").doc(uid);
    const partnerRef = db().collection("users").doc(partnerUid);
    const [meSnap, partnerSnap] = await Promise.all([tx.get(meRef), tx.get(partnerRef)]);
    if (meSnap.get("coupleId")) {
      throw new HttpsError("failed-precondition", "You're already paired.");
    }
    if (!partnerSnap.exists || partnerSnap.get("coupleId")) {
      throw new HttpsError("failed-precondition", "That person is already paired.");
    }

    const coupleRef = db().collection("couples").doc();
    tx.create(coupleRef, {
      members: [partnerUid, uid],
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(meRef, { coupleId: coupleRef.id });
    tx.update(partnerRef, { coupleId: coupleRef.id });
    tx.delete(codeRef);
    return coupleRef.id;
  });

  // Clean up any other code the caller still had.
  const leftovers = await db().collection("inviteCodes").where("uid", "==", uid).get();
  await Promise.all(leftovers.docs.map((d) => d.ref.delete()));

  return { coupleId };
});
