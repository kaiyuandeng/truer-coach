import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Last response per GET path, so revisiting a page paints instantly while it refreshes. */
const cache = new Map<string, unknown>();

/** Fetches a GET endpoint and exposes reload; keeps old (or cached) data visible while reloading. */
export function useApi<T>(path: string | null) {
  const [data, setDataState] = useState<T | null>(() => (path ? ((cache.get(path) as T) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const latest = useRef(path);
  latest.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await api.get<T>(path);
      cache.set(path, d);
      if (latest.current === path) {
        setDataState(d);
        setError(null);
      }
    } catch (e) {
      if (latest.current === path) setError((e as Error).message);
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);

  // Optimistic edits update the cache too, so going back to a page doesn't flash stale values.
  const setData = useCallback(
    (next: T | null | ((cur: T | null) => T | null)) =>
      setDataState((cur) => {
        const v = typeof next === "function" ? (next as (c: T | null) => T | null)(cur) : next;
        if (path) v === null ? cache.delete(path) : cache.set(path, v);
        return v;
      }),
    [path],
  );

  useEffect(() => {
    if (path) setDataState((cache.get(path) as T) ?? null);
    load();
  }, [load, path]);

  return { data, setData, error, loading, reload: load };
}

/** Re-runs a callback when the tab becomes visible again (e.g. reopening the home-screen app). */
export function useOnFocus(cb: () => void) {
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && cb();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [cb]);
}
