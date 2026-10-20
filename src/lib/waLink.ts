/** wa.me link that opens a chat with the assistant with "/link CODE" typed in; "" when no number is configured. */
export function waMeLink(number: string | undefined, code: string): string {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(`/link ${code}`)}`;
}

/** Milliseconds left -> "m:ss" (whole seconds, never negative). */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
