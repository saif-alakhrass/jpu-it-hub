import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchSubjectsPaged, fetchAllSubjects, fetchSubject } from '@/services/subjects';

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
  });

  return {
    data: query.data ?? { items: [], total: 0, page, totalPages: 1 },
    loading: query.isLoading,
    refreshing: query.isFetching,
    error: query.error,
    page,
    setPage,
    reload: query.refetch,
  };
}

export function useAllSubjects() {
  const query = useQuery({ queryKey: ['subjects', 'all'], queryFn: fetchAllSubjects });
  return { subjects: query.data ?? [], loading: query.isLoading, error: query.error, reload: query.refetch };
}

export function useSubject(subjectId: string) {
  return useQuery({
    queryKey: ['subjects', 'detail', subjectId],
    queryFn: () => fetchSubject(subjectId),
    enabled: Boolean(subjectId),
  });
}
