import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { addDays, format } from "date-fns";
import { db } from "@/lib/firebase";
import { CalendarEvent, EventException, EventOwner, toDate } from "@/lib/recurrence";
import { EventDraft } from "./calendarUtils";

export interface Identity {
  coupleId: string;
  uid: string;
  partnerId: string | null;
}

const ALL_DAY_START = "00:00";
const ALL_DAY_END = "23:59";

/**
 * Events store `owner` from the writer's perspective plus an absolute `ownerId`;
 * readers derive me/partner/us from `ownerId` (see CoupleDataContext).
 */
function ownerFields(owner: EventOwner, who: Identity) {
  return {
    owner,
    ownerId: owner === "us" ? "us" : owner === "me" ? who.uid : who.partnerId,
  };
}

function timeFields(draft: EventDraft) {
  return draft.allDay
    ? { allDay: true, startTime: ALL_DAY_START, endTime: ALL_DAY_END }
    : { allDay: false, startTime: draft.startTime, endTime: draft.endTime };
}

/** Core fields shared by every stored event. */
function baseFields(draft: EventDraft, who: Identity) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    dateStr: draft.dateStr,
    ...timeFields(draft),
    ...ownerFields(draft.owner, who),
  };
}

function repeatFields(draft: EventDraft) {
  if (draft.repeatType === "none") return {};
  return {
    repeatType: draft.repeatType,
    ...(draft.repeatType === "weekly" ? { repeatDays: [...draft.repeatDays].sort() } : {}),
    ...(draft.repeatUntil ? { repeatUntil: draft.repeatUntil } : {}),
  };
}

const eventsRef = (coupleId: string) => collection(db, "couples", coupleId, "events");
const eventRef = (coupleId: string, id: string) => doc(db, "couples", coupleId, "events", id);

export async function createEvent(draft: EventDraft, who: Identity) {
  await setDoc(doc(eventsRef(who.coupleId)), { ...baseFields(draft, who), ...repeatFields(draft) });
}

/** Update a non-repeating event, or a whole series (template) including its rule. */
export async function updateEvent(id: string, draft: EventDraft, who: Identity) {
  const repeating = draft.repeatType !== "none";
  await updateDoc(eventRef(who.coupleId, id), {
    ...baseFields(draft, who),
    repeatType: repeating ? draft.repeatType : deleteField(),
    repeatDays: repeating && draft.repeatType === "weekly" ? [...draft.repeatDays].sort() : deleteField(),
    repeatUntil: repeating && draft.repeatUntil ? draft.repeatUntil : deleteField(),
    // A one-off event has no per-date overrides.
    ...(repeating ? {} : { exceptions: deleteField() }),
    durationMinutes: deleteField(),
  });
}

/**
 * Edit a single occurrence of a series. Same date: store an override. A new
 * date: hide this occurrence and create a standalone event on the new date.
 */
export async function updateOccurrence(
  occurrence: CalendarEvent,
  draft: EventDraft,
  who: Identity,
) {
  const templateId = occurrence.originalEventId ?? occurrence.id;
  const templateRef = eventRef(who.coupleId, templateId);
  const key = `exceptions.${occurrence.dateStr}`;

  if (draft.dateStr === occurrence.dateStr) {
    const times = timeFields(draft);
    const exception: EventException = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      startTime: times.startTime,
      endTime: times.endTime,
      ...ownerFields(draft.owner, who),
    };
    await updateDoc(templateRef, { [key]: exception });
    return;
  }

  const batch = writeBatch(db);
  batch.update(templateRef, { [key]: { deleted: true } satisfies EventException });
  batch.set(doc(eventsRef(who.coupleId)), baseFields(draft, who));
  await batch.commit();
}

export async function deleteEvent(id: string, who: Identity) {
  await deleteDoc(eventRef(who.coupleId, id));
}

export async function deleteOccurrence(occurrence: CalendarEvent, who: Identity) {
  const templateId = occurrence.originalEventId ?? occurrence.id;
  await updateDoc(eventRef(who.coupleId, templateId), {
    [`exceptions.${occurrence.dateStr}`]: { deleted: true } satisfies EventException,
  });
}

/** End the series the day before this occurrence (deletes the series if it's the first one). */
export async function deleteThisAndFollowing(
  occurrence: CalendarEvent,
  template: CalendarEvent,
  who: Identity,
) {
  if (occurrence.dateStr <= template.dateStr) {
    await deleteEvent(template.id, who);
    return;
  }
  const dayBefore = format(addDays(toDate(occurrence.dateStr), -1), "yyyy-MM-dd");
  await updateDoc(eventRef(who.coupleId, template.id), { repeatUntil: dayBefore });
}
