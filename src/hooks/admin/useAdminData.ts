/**
 * Custom hook for admin data management
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';
import type { FileRow, Profile, Subject, AdminStats, FileStatus } from '@/lib/types';
import {
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  fetchAdminFilesPaged,
  fetchAdminStats,
} from '@/services/files';
import { fetchAllSubjects } from '@/services/subjects';
import { fetchProfiles } from '@/services/auth';

export function useAdminData() {
  const { isAdmin } = useAuth();
  const [pending, setPending] = useState<FileRow[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(0);
  const [rejectedFiles, setRejectedFiles] = useState<FileRow[]>([]);
  const [rejectedTotal, setRejectedTotal] = useState(0);
  const [rejectedPage, setRejectedPage] = useState(0);
  const [managedFiles, setManagedFiles] = useState<FileRow[]>([]);
  const [managedTotal, setManagedTotal] = useState(0);
  const [managedPage, setManagedPage] = useState(0);
  const [managedStatus, setManagedStatus] = useState<FileStatus | 'all'>('all');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPending = useCallback(async () => {
    const result = await fetchPendingFilesPaged(pendingPage);
    setPending(result.items);
    setPendingTotal(result.total);
  }, [pendingPage]);

  const loadRejected = useCallback(async () => {
    const result = await fetchRejectedFilesPaged(rejectedPage);
    setRejectedFiles(result.items);
    setRejectedTotal(result.total);
  }, [rejectedPage]);

  const loadManagedFiles = useCallback(async () => {
    const result = await fetchAdminFilesPaged(managedPage, managedStatus === 'all' ? undefined : managedStatus);
    setManagedFiles(result.items);
    setManagedTotal(result.total);
  }, [managedPage, managedStatus]);

  const loadSubjects = useCallback(async () => {
    setSubjects(await fetchAllSubjects());
  }, []);

  const loadUsers = useCallback(async () => {
    setStudents(await fetchProfiles());
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await fetchAdminStats());
  }, []);

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      await Promise.all([
        loadPending(),
        loadRejected(),
        loadManagedFiles(),
        loadSubjects(),
        loadUsers(),
        loadStats(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, loadPending, loadRejected, loadManagedFiles, loadSubjects, loadUsers, loadStats]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    isAdmin,
    loading,
    pending,
    pendingTotal,
    pendingPage,
    setPendingPage,
    rejectedFiles,
    rejectedTotal,
    rejectedPage,
    setRejectedPage,
    managedFiles,
    managedTotal,
    managedPage,
    setManagedPage,
    managedStatus,
    setManagedStatus,
    subjects,
    students,
    stats,
    loadAll,
    loadPending,
    loadRejected,
    loadManagedFiles,
    loadStats,
  };
}