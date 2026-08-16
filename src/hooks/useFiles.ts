import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchFilesForSubject,
  fetchBatchesForSubject,
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  type PaginatedFiles,
} from '@/services/files';
import { emptyPage } from '@/lib/pagination';
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

function usePagedFiles(fetchPage: (page: number) => Promise<PaginatedFiles>) {
  const [data, setData] = useState<PaginatedFiles>(() => emptyPage<FileRow>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPage(page));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, page, setPage, reload };
}

export function usePendingFiles() {
  return usePagedFiles(fetchPendingFilesPaged);
}

export function useRejectedFiles() {
  return usePagedFiles(fetchRejectedFilesPaged);
}
