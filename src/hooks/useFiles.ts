import { useCallback, useEffect, useState } from 'react';
import {
  fetchFilesForSubject,
  fetchBatchesForSubject,
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  type PaginatedFiles,
} from '@/services/files';
import type { FileBatch, FileRow, FileTab } from '@/lib/types';

export function useSubjectFiles(subjectId: string, tab?: FileTab) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [batches, setBatches] = useState<FileBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, b] = await Promise.all([
        fetchFilesForSubject(subjectId, tab),
        fetchBatchesForSubject(subjectId, tab),
      ]);
      setFiles(f);
      setBatches(b);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [subjectId, tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { files, batches, loading, error, reload, setFiles, setBatches };
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
