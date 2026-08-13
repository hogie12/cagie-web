# Recurring Events — Design Spec

## Summary

Add recurring event support to the calendar. Users can set an event to repeat **daily** or on **selected days of the week**, with an **end date**. A single Firestore document stores the recurrence rules; occurrences are expanded client-side. Individual occurrences can be edited or deleted independently via an exceptions mechanism.

Also replaces the current **start time + duration dropdown** with a **start time / end time range picker** for more flexible scheduling.

## Data Model Changes

### `CalendarEvent` interface additions

```typescript
// New fields on CalendarEvent (all optional for backward compat)
repeatType?: "none" | "daily" | "weekly";   // default: "none"
repeatDays?: number[];                       // 0=Sun..6=Sat, only used when repeatType="weekly"
repeatUntil?: string;                        // "YYYY-MM-DD" end date (inclusive)
exceptions?: Record<string, EventException>; // keyed by "YYYY-MM-DD"
isOccurrence?: boolean;                      // client-only flag, not stored in Firestore
originalEventId?: string;                    // client-only, points back to template
```

### `EventException` type

```typescript
interface EventException {
  deleted?: boolean;          // true = skip this date
  title?: string;             // override fields (only changed ones)
  description?: string;
  startTime?: string;
  endTime?: string;
  owner?: EventOwner;
  ownerId?: string;
}
```

### Firestore document

Stored at `couples/{coupleId}/events/{eventId}`. Existing non-repeating events are unaffected (`repeatType` is absent or `"none"`).

## Client-Side Expansion Logic

Lives in `CoupleDataContext.tsx`. After fetching raw events from Firestore:

1. For each event where `repeatType !== "none"` and `repeatUntil` exists:
   - Generate all occurrence dates from `dateStr` to `repeatUntil`
   - For `"daily"`: every day in range
   - For `"weekly"`: only days matching `repeatDays`
   - For each date, check `exceptions[dateStr]`:
     - If `{ deleted: true }` → skip
     - If override fields exist → merge with template
   - Emit an expanded `CalendarEvent` per date with `isOccurrence: true` and `originalEventId`
2. Non-repeating events pass through unchanged.

> [!IMPORTANT]
> To prevent performance issues, we should cap expansion to a reasonable window (e.g., ±3 months from today or the viewed month range) rather than expanding all dates to `repeatUntil`.

## UI Changes

### Add Event Modal (`calendar/page.tsx`)

**Time range**: Replace the current "Time + Duration dropdown" with two time inputs side by side:
- **Start time** (time input)
- **End time** (time input, must be after start time)

The `durationMinutes` field is removed from the data model. The event block height on the timeline is now computed from `endTime - startTime`.

After the time row, add a **Repeat** section:

1. **Repeat type** toggle: `None` | `Daily` | `Weekly` (pill buttons, like the "Who" selector)
2. **Weekly day picker** (shown only when `Weekly`): 7 small circle buttons for S M T W T F S, multi-select
3. **Until date** picker (shown when repeat is not `None`): standard date input, defaults to 1 month from selected date

### Edit Event Modal

When clicking a recurring event occurrence:
- Show a badge/label: "🔁 Repeats daily" or "🔁 Repeats Mon, Wed, Fri"
- On clicking **Edit** or **Delete**, show a prompt:
  - **"This event only"** → creates/updates an exception in `exceptions` map
  - **"All events"** → edits/deletes the template document itself

### View Mode (event details)

Show repeat info: e.g., "Repeats daily until Aug 30, 2026" or "Repeats Mon, Wed, Fri until Dec 31, 2026"

## File Changes

### [MODIFY] [CoupleDataContext.tsx](file:///Users/hogie/Documents/learn/Date%20Planner/cagie/src/context/CoupleDataContext.tsx)
- Add `EventException` type export
- Replace `durationMinutes` with `endTime` in `CalendarEvent`
- Add `repeatType`, `repeatDays`, `repeatUntil`, `exceptions`, `isOccurrence`, `originalEventId` to `CalendarEvent`
- Add `expandRecurringEvents()` helper function
- Call it in the `onSnapshot` callback to expand events before setting state

### [MODIFY] [calendar/page.tsx](file:///Users/hogie/Documents/learn/Date%20Planner/cagie/src/app/(app)/calendar/page.tsx)
- Replace time+duration inputs with start time / end time range picker
- Compute event block height from `endTime - startTime` instead of `durationMinutes`
- Add repeat-related state variables to Add modal
- Add repeat UI (type selector, day picker, until date)
- Store repeat fields when saving new event
- Update `handleEventClick` to handle occurrences
- Add "This event only" / "All events" prompt for edit/delete
- Update `handleUpdateEvent` and `handleDeleteEvent` to support exception writes
- Show repeat badge in view mode

## Overlap Handling

Overlap checking currently runs against `todayEvents`. Since expanded occurrences will already be in `todayEvents`, the existing overlap logic works without changes.

## Backward Compatibility

- Existing events have no `repeatType` field → treated as `"none"` → no expansion → works as before
- No migration needed
