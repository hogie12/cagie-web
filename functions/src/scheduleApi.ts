import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { createFirestoreRepo } from "./firestoreRepo";
import { createScheduleHandler } from "./scheduleHandler";

const SCHEDULE_TOKEN = defineSecret("SCHEDULE_TOKEN");
const LINK_SALT = defineSecret("LINK_SALT");
const SCHEDULE_TZ = defineString("SCHEDULE_TZ", { default: "Asia/Jakarta" });

/** HTTP API used by the wa-agent WhatsApp assistant (bearer token; see scheduleHandler.ts). */
export const scheduleApi = onRequest(
  { region: "asia-southeast2", maxInstances: 2, secrets: [SCHEDULE_TOKEN, LINK_SALT] },
  async (req, res) => {
    const handle = createScheduleHandler({
      repo: createFirestoreRepo(getFirestore()),
      token: SCHEDULE_TOKEN.value(),
      salt: LINK_SALT.value(),
      tz: SCHEDULE_TZ.value(),
      now: () => new Date(),
    });
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) if (typeof v === "string") query[k] = v;
    const out = await handle({
      method: req.method,
      path: req.path,
      query,
      headers: { authorization: req.get("authorization"), "x-actor-jid": req.get("x-actor-jid") },
      body: req.body,
    });
    if (typeof out.body === "string") res.status(out.status).send(out.body);
    else res.status(out.status).json(out.body);
  },
);
