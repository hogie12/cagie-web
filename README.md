# Cagie 💕

A shared planner for couples: a calendar with "me / partner / us" lanes, a sticky-notes wall,
a daily photo and greeting, and push notifications. Next.js 16 (App Router, client-side) +
Firebase (Auth, Firestore, Storage, Cloud Functions, Cloud Messaging).

## Getting started

```bash
npm install
npm --prefix functions install
cp .env.example .env.local   # fill in your Firebase web config
npm run dev
```

### Local development with the emulators

No production data needed. Install the [Firebase CLI](https://firebase.google.com/docs/cli)
(Java 21 is required for the Firestore emulator), then:

```bash
npm run emulators          # builds functions, starts auth/firestore/storage/functions
```

and in `.env.local` use the demo values at the bottom of `.env.example`
(`NEXT_PUBLIC_USE_EMULATORS=true`, project `demo-cagie`). Sign up two accounts in two browser
profiles and pair them with the invite code.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (recurrence, clash detection, timeline layout) |
| `npm run test:rules` | Firestore + Storage security-rules tests in the emulators |
| `npm run emulators` | Local Firebase emulators |

CI (`.github/workflows/ci.yml`) runs all of the above on every PR.

## Project layout

```
src/
  app/(auth)/        login, pair
  app/(app)/         signed-in + paired pages (layout guards the route)
    calendar/        Day / Month / Agenda views, event form & detail sheets
  context/           AuthContext (live profile + partner), CoupleDataContext (live couple data), toasts
  lib/recurrence.ts  repeating-event expansion, clash detection, day layout (unit tested)
functions/src/       pairing (getInviteCode / pairWithCode) and push notifications
firestore.rules      data access rules (tested in tests/rules)
storage.rules        photo upload rules
```

### Data model (Firestore)

- `users/{uid}`: `name`, `photoURL`, `coupleId` (set only by Cloud Functions), `fcmTokens`
- `couples/{id}`: `members: [uid, uid]` (created only by `pairWithCode`)
  - `events/{id}`: `title`, `dateStr`, `startTime`, `endTime`, `allDay`, `ownerId` (uid or `"us"`),
    optional `repeatType` (`daily|weekly|monthly|yearly`), `repeatDays`, `repeatUntil`, and
    per-date `exceptions`
  - `notes/{id}`, `dashboard/main` (greetings + daily photos), `history/{id}` (written by functions)
- `inviteCodes/{code}`: private to functions, expire after 7 days

## Deploying

The website is hosted on Vercel at `https://cagie-web.vercel.app` (deployed on push to `main`).
Push notifications link there; override with the `APP_URL` environment variable on the
functions if the domain changes.

Rules, storage rules and functions must go out together. The client no longer writes
pairing data, so old rules + new client (or the reverse) breaks pairing:

```bash
firebase deploy --only firestore:rules,storage,functions
```

The first Storage-rules deploy asks to let Storage read Firestore (needed for the
couple-membership check). Accept it. Apply `cors.json` to the bucket with
`gsutil cors set cors.json gs://<bucket>` if the web origin changes.

## WhatsApp assistant

The [wa-agent](https://github.com/hogie12/wa-agent) WhatsApp bot can show and change a user's own and shared ("us")
events, never the partner's. Users connect on the Profile page ("WhatsApp assistant"): the app shows a one-time code
(valid 10 minutes) to send as `/link CODE` to the assistant. Every change made through WhatsApp needs an explicit YES and
is logged in `couples/{id}/botAudit`.

Pieces:

- `functions/src/scheduleApi.ts`: HTTP API for the bot (bearer token), logic in `scheduleHandler.ts` / `scheduleCore.ts`.
- `functions/src/whatsappLink.ts`: `getWhatsAppLinkCode` / `unlinkWhatsApp` callables.
- `functions/src/recurrence.ts` is a copy of `src/lib/recurrence.ts`; keep them in sync.
- Firestore: `waLinkCodes`, `waLinks` (numbers stored only as salted hashes), `waLinkAttempts`, `couples/{id}/botAudit`;
  all closed to clients.

Tests: `npm test` (unit, includes the function logic), `npm run test:rules` and `npm run test:repo`
(Firestore emulator; needs the Firebase CLI and Java 21+).

Setup (once):

```bash
openssl rand -hex 32 | firebase functions:secrets:set SCHEDULE_TOKEN --data-file=-
openssl rand -hex 32 | firebase functions:secrets:set LINK_SALT --data-file=-
firebase deploy --only firestore:rules,functions
```

`functions/.env` holds the non-secret `SCHEDULE_TZ` parameter (committed on purpose; it contains no secrets).

Then set `NEXT_PUBLIC_WA_ASSISTANT_NUMBER` (the assistant's number, e.g. `6281234567890`) in Vercel and redeploy, and
give the bot the `scheduleApi` URL and the same `SCHEDULE_TOKEN` (read it with
`firebase functions:secrets:access SCHEDULE_TOKEN`). Deploy rules and functions before the UI.

