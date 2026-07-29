import { useCallback, useEffect, useState } from 'react';
import { fetchSubjectsPaged, fetchAllSubjects, type PaginatedSubjects } from '@/services/subjects';
import type { Subject } from '@/lib/types';

export function useSubjectsPaged(search: string, major: string | undefined) {
  const [data, setData] = useState<PaginatedSubjects>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchSubjectsPaged(page, search || undefined, major);
    setData(result);
    setLoading(false);
  }, [page, search, major]);

  useEffect(() => {
    setPage(0);
  }, [search, major]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, page, setPage, reload };
}

export function useAllSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const items = await fetchAllSubjects();
    setSubjects(items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { subjects, loading, reload };
}
