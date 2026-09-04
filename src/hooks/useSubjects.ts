import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchSubjectsPaged, fetchAllSubjects, fetchSubject, searchSubjectsPaged } from '@/services/subjects';

export const SUBJECT_STALE_TIME = 1000 * 60 * 15;

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function useSubjectsPaged(search: string, major: string | undefined, initialPage = 0) {
  const [page, setPage] = useState(initialPage);
  const debouncedSearch = useDebouncedValue(search.trim());
  const firstFilterRender = useRef(true);

  useEffect(() => {
    if (firstFilterRender.current) {
      firstFilterRender.current = false;
      return;
    }
    setPage(0);
  }, [debouncedSearch, major]);

  const query = useQuery({
    queryKey: ['subjects', 'paged', page, debouncedSearch, major ?? null],
    queryFn: () => fetchSubjectsPaged(page, debouncedSearch || undefined, major),
    placeholderData: keepPreviousData,
    staleTime: SUBJECT_STALE_TIME,
    enabled: !debouncedSearch,
  });

  // Share the assistant's catalog cache. Keystrokes filter in memory rather
  // than issuing a new Supabase request, without changing normal pagination.
  const catalog = useQuery({
    queryKey: ['subjects', 'all'], queryFn: fetchAllSubjects,
    staleTime: SUBJECT_STALE_TIME, enabled: Boolean(debouncedSearch),
  });
  const searchData = useMemo(() => searchSubjectsPaged(catalog.data ?? [], page, debouncedSearch, major), [catalog.data, page, debouncedSearch, major]);
  const activeQuery = debouncedSearch ? catalog : query;

  return {
    data: debouncedSearch ? searchData : query.data ?? { items: [], total: 0, page, totalPages: 1 },
    loading: activeQuery.isLoading,
    refreshing: activeQuery.isFetching,
    error: activeQuery.error,
    page,
    setPage,
    reload: activeQuery.refetch,
  };
}

export function useAllSubjects() {
  const query = useQuery({ queryKey: ['subjects', 'all'], queryFn: fetchAllSubjects, staleTime: SUBJECT_STALE_TIME });
  return { subjects: query.data ?? [], loading: query.isLoading, error: query.error, reload: query.refetch };
}

export function useSubject(subjectId: string) {
  return useQuery({
    queryKey: ['subjects', 'detail', subjectId],
    queryFn: () => fetchSubject(subjectId),
    enabled: Boolean(subjectId),
    staleTime: SUBJECT_STALE_TIME,
  });
}
