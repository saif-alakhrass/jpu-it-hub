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

  const reload = useCallback(async () => {
    setLoading(true);
    const [f, b] = await Promise.all([
      fetchFilesForSubject(subjectId, tab),
      fetchBatchesForSubject(subjectId, tab),
    ]);
    setFiles(f);
    setBatches(b);
    setLoading(false);
  }, [subjectId, tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { files, batches, loading, reload, setFiles, setBatches };
}

export function usePendingFiles() {
  const [data, setData] = useState<PaginatedFiles>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchPendingFilesPaged(page);
    setData(result);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, page, setPage, reload };
}

export function useRejectedFiles() {
  const [data, setData] = useState<PaginatedFiles>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchRejectedFilesPaged(page);
    setData(result);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, page, setPage, reload };
}
