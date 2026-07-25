import type { FileRow, FileStatus } from './types';

export const VALID_TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['rejected'],
  rejected: ['approved'],
};

export function canTransition(from: FileStatus, to: FileStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionFile(file: FileRow, to: FileStatus): FileRow {
  if (!canTransition(file.status, to)) return file;
  return { ...file, status: to };
}

export function removeFromPending(
  pending: FileRow[],
  id: string,
): FileRow[] {
  return pending.filter((f) => f.id !== id);
}

export function updateInList(
  files: FileRow[],
  id: string,
  status: FileStatus,
): FileRow[] {
  return files.map((f) => (f.id === id ? { ...f, status } : f));
}
