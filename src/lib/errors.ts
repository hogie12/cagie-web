/** Human-readable message for an unknown thrown value (Firebase errors included). */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message);
    // Firebase messages look like "Firebase: Error (auth/wrong-password)."
    const code = /\(([\w-]+\/[\w-]+)\)/.exec(message)?.[1];
    if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
    return message || fallback;
  }
  return fallback;
}

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/email-already-in-use": "That email already has an account. Try signing in.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network error. Check your connection.",
};
