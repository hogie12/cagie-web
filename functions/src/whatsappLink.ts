import { randomInt } from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { createFirestoreRepo } from "./firestoreRepo";
import { LINK_CODE_TTL_MS, newLinkCode } from "./linkCore";

const REGION = "asia-southeast2";
const db = () => getFirestore();

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Please sign in first.");
  return auth.uid;
}

/** A one-time code the signed-in, paired user sends to the assistant as "/link CODE". */
export const getWhatsAppLinkCode = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  const user = await db().collection("users").doc(uid).get();
  const coupleId: string | undefined = user.get("coupleId");
  if (!coupleId) throw new HttpsError("failed-precondition", "Pair with your partner first.");

  // One active code per user: drop older ones.
  const old = await db().collection("waLinkCodes").where("uid", "==", uid).get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newLinkCode(randomInt);
    try {
      await db().collection("waLinkCodes").doc(code).create({ uid, coupleId, expiresAt: now + LINK_CODE_TTL_MS });
      return { code, expiresAt: now + LINK_CODE_TTL_MS };
    } catch {
      // Code collision: try another one.
    }
  }
  throw new HttpsError("internal", "Could not create a code. Try again.");
});

/** Disconnects every WhatsApp number linked to the caller. */
export const unlinkWhatsApp = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request.auth);
  await createFirestoreRepo(db()).deleteLinksForUid(uid);
  return { ok: true };
});
