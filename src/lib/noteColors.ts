export interface NoteColor {
  id: string;
  bg: string;
  border: string;
  text: string;
}

export const NOTE_COLORS: NoteColor[] = [
  { id: "yellow", bg: "bg-[#fef08a]", border: "border-[#fde047]", text: "text-amber-900" },
  { id: "pink", bg: "bg-[#fbcfe8]", border: "border-[#f9a8d4]", text: "text-pink-900" },
  { id: "blue", bg: "bg-[#bfdbfe]", border: "border-[#93c5fd]", text: "text-blue-900" },
  { id: "green", bg: "bg-[#bbf7d0]", border: "border-[#86efac]", text: "text-green-900" },
  { id: "purple", bg: "bg-[#e9d5ff]", border: "border-[#d8b4fe]", text: "text-purple-900" },
];

export const noteColor = (id: string): NoteColor =>
  NOTE_COLORS.find((c) => c.id === id) ?? NOTE_COLORS[0];

/** Notes have stored createdAt as an ISO string, a Firestore Timestamp, or millis. */
export function createdAtMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}
