import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Fetches a GET endpoint and exposes reload; keeps old data visible while reloading. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const latest = useRef(path);
  latest.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await api.get<T>(path);
      if (latest.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (latest.current === path) setError((e as Error).message);
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

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
