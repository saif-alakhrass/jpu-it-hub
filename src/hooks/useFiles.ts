import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchFilesForSubject,
  fetchBatchesForSubject,
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  type PaginatedFiles,
} from '@/services/files';
import type { FileBatch, FileRow, FileTab } from '@/lib/types';

export function useSubjectFiles(subjectId: string, tab?: FileTab) {
  const queryClient = useQueryClient();
  const filesKey = useMemo(() => ['files', 'subject', subjectId, tab ?? 'all'] as const, [subjectId, tab]);
  const batchesKey = useMemo(() => ['batches', 'subject', subjectId, tab ?? 'all'] as const, [subjectId, tab]);
  const filesQuery = useQuery({
    queryKey: filesKey,
    queryFn: () => fetchFilesForSubject(subjectId, tab),
    placeholderData: keepPreviousData,
  });
  const batchesQuery = useQuery({
    queryKey: batchesKey,
    queryFn: () => fetchBatchesForSubject(subjectId, tab),
    placeholderData: keepPreviousData,
  });
  const reload = useCallback(async () => {
    await Promise.all([filesQuery.refetch(), batchesQuery.refetch()]);
  }, [filesQuery, batchesQuery]);
  const setFiles = useCallback((updater: SetStateAction<FileRow[]>) => {
    queryClient.setQueryData<FileRow[]>(filesKey, (previous = []) =>
      typeof updater === 'function' ? updater(previous) : updater,
    );
  }, [queryClient, filesKey]);
  const setBatches = useCallback((updater: SetStateAction<FileBatch[]>) => {
    queryClient.setQueryData<FileBatch[]>(batchesKey, (previous = []) =>
      typeof updater === 'function' ? updater(previous) : updater,
    );
  }, [queryClient, batchesKey]);

  return {
    files: filesQuery.data ?? [],
    batches: batchesQuery.data ?? [],
    loading: filesQuery.isLoading || batchesQuery.isLoading,
    error: filesQuery.error ?? batchesQuery.error,
    reload,
    setFiles,
    setBatches,
  };
}

export function usePendingFiles() {
  const [data, setData] = useState<PaginatedFiles>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPendingFilesPaged(page));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, page, setPage, reload };
}

export function useRejectedFiles() {
  const [data, setData] = useState<PaginatedFiles>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchRejectedFilesPaged(page));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, page, setPage, reload };
}
