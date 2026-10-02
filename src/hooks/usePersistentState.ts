"use client";

import { useEffect, useState } from "react";

/**
 * useState that remembers its value in localStorage (per browser).
 * Only use in components that don't render on the server, otherwise the first
 * client render can differ from the server HTML.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T = (v): v is T => v !== undefined && v !== null,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (isValid(parsed)) return parsed;
      }
    } catch {
      // Storage unavailable (private mode, blocked) or bad JSON: use the default.
    }
    return initial;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore: persistence is a convenience only.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
