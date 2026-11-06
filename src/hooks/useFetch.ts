import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Load data when the screen is focused (and when `deps` change), optionally polling. */
export function useFetch<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Always call the latest `load` without re-subscribing on every render.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async (manual: boolean) => {
    if (manual) setRefreshing(true);
    try {
      const d = await loadRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const key = JSON.stringify(deps);
  useFocusEffect(
    useCallback(() => {
      run(false);
      if (!pollMs) return;
      const id = setInterval(() => run(false), pollMs);
      return () => clearInterval(id);
      // `key` re-runs the load when the inputs change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [run, pollMs, key]),
  );

  return { data, error, loading, refreshing, reload: () => run(true) };
}
