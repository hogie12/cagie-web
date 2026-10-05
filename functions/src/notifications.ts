import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

const APP_URL = process.env.APP_URL || "https://cagie-web.vercel.app";

interface Entry {
  updatedAt: number;
  text?: string;
  url?: string;
}

type EntryMap = Record<string, Entry>;

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

/** uids whose entry was added or changed between two versions of a map. */
function changedUids(before: EntryMap, after: EntryMap): string[] {
  return Object.keys(after).filter(
    (uid) => !before[uid] || before[uid].updatedAt !== after[uid].updatedAt,
  );
}

export const onDashboardUpdate = onDocumentWritten(
  { document: "couples/{coupleId}/dashboard/main", region: "asia-southeast2" },
  async (event) => {
    const change = event.data;
    if (!change) return;

    const { coupleId } = event.params;
    const after = change.after.data();
    const before = change.before.data();
    if (!after) return; // Document deleted

    const newGreetings: EntryMap = after.greetings || {};
    const newPaps: EntryMap = after.paps || {};
    const greetingUids = changedUids(before?.greetings || {}, newGreetings);
    const papUids = changedUids(before?.paps || {}, newPaps);
    if (greetingUids.length === 0 && papUids.length === 0) return;

    const firestore = getFirestore();
    const historyRef = firestore.collection("couples").doc(coupleId).collection("history");

    // Deterministic ids keep this idempotent when the event is redelivered.
    const batch = firestore.batch();
    for (const uid of greetingUids) {
      const g = newGreetings[uid];
      batch.set(historyRef.doc(`greeting_${uid}_${g.updatedAt}`), {
        type: "greeting",
        uid,
        text: g.text ?? "",
        updatedAt: g.updatedAt,
      });
    }
    for (const uid of papUids) {
      const p = newPaps[uid];
      batch.set(historyRef.doc(`pap_${uid}_${p.updatedAt}`), {
        type: "pap",
        uid,
        url: p.url ?? "",
        updatedAt: p.updatedAt,
      });
    }
    await batch.commit();

    // Rules only let a member write their own entry, so the changed key is the sender.
    const senderId = greetingUids[0] ?? papUids[0];
    const greeting = greetingUids.includes(senderId) ? newGreetings[senderId]?.text : undefined;
    const sentPhoto = papUids.includes(senderId);

    let title: string;
    let body: string;
    if (greeting && sentPhoto) {
      title = "New greeting & photo! 💕📸";
      body = `"${greeting}"`;
    } else if (greeting) {
      title = "New Greeting! 💕";
      body = `"${greeting}"`;
    } else {
      title = "New Daily Pipipip! 📸";
      body = "Your partner uploaded a new photo. Open the app to see it!";
    }

    const coupleSnap = await firestore.collection("couples").doc(coupleId).get();
    const members: string[] = coupleSnap.get("members") || [];
    const recipients = members.filter((uid) => uid !== senderId);

    await Promise.all(
      recipients.map(async (uid) => {
        const userRef = firestore.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const tokens: string[] = userSnap.get("fcmTokens") || [];
        if (tokens.length === 0) return;

        // Notification payload only: the FCM SDK in the service worker displays it
        // and opens `link` on click, so the page must not show it a second time.
        const response = await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title, body },
          webpush: {
            notification: {
              icon: "/web-app-manifest-192x192.png",
              badge: "/web-app-manifest-192x192.png",
              tag: `cagie-${coupleId}`,
              renotify: true,
            },
            fcmOptions: { link: `${APP_URL}/home` },
          },
        });

        const stale = tokens.filter((_, i) => {
          const code = response.responses[i].error?.code;
          return code !== undefined && INVALID_TOKEN_CODES.has(code);
        });
        if (stale.length > 0) {
          await userRef.update({
            fcmTokens: FieldValue.arrayRemove(...stale),
          });
        }
      }),
    );
  },
);
