import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks loading/error state. `deps` behaves like a
 * useEffect dependency list. Results from a superseded call are discarded, so
 * fast filter changes cannot leave stale rows on screen.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const runId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = ++runId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (runId.current === id) setState({ data, error: null, loading: false });
    } catch (error) {
      if (runId.current === id) setState({ data: null, error, loading: false });
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}

/** Delays a rapidly changing value — used for search boxes. */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
