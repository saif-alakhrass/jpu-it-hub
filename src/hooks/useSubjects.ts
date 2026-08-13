import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSubjectsPaged, fetchAllSubjects, type PaginatedSubjects } from '@/services/subjects';
import type { Subject } from '@/lib/types';

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useSubjectsPaged(search: string, major: string | undefined) {
  const [data, setData] = useState<PaginatedSubjects>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim());
  const requestId = useRef(0);
  const hasLoaded = useRef(false);

  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      const result = await fetchSubjectsPaged(page, debouncedSearch || undefined, major);
      if (currentRequest !== requestId.current) return;
      setData(result);
      hasLoaded.current = true;
    } catch (nextError) {
      if (currentRequest !== requestId.current) return;
      setError(nextError);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [page, debouncedSearch, major]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, major]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, page, setPage, reload };
}

export function useAllSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchAllSubjects();
      setSubjects(items);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { subjects, loading, error, reload };
}
