import type { FileStatus } from './types';

export function deriveBatchStatus(statuses: FileStatus[]): FileStatus {
  if (statuses.length === 0) return 'pending';
  if (statuses.every((status) => status === 'approved')) return 'approved';
  if (statuses.every((status) => status === 'rejected')) return 'rejected';
  return 'pending';
}
