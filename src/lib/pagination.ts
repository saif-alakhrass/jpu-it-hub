import { PAGE_SIZE } from '@/lib/constants';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export function pageRange(page: number, pageSize = PAGE_SIZE): { from: number; to: number } {
  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function countTotalPages(total: number | null | undefined, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil((total ?? 0) / pageSize));
}

export function paginated<T>(items: T[], total: number | null | undefined, page: number, pageSize = PAGE_SIZE): Paginated<T> {
  return { items, total: total ?? 0, page, totalPages: countTotalPages(total, pageSize) };
}

export function emptyPage<T>(page = 0): Paginated<T> {
  return { items: [] as T[], total: 0, page, totalPages: 1 };
}
