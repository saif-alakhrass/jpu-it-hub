import { describe, expect, it } from 'vitest';
import { PAGE_SIZE } from './constants';
import { countTotalPages, emptyPage, pageRange, paginated } from './pagination';

describe('pageRange', () => {
  it('returns an inclusive supabase range for the given page', () => {
    expect(pageRange(0)).toEqual({ from: 0, to: PAGE_SIZE - 1 });
    expect(pageRange(2)).toEqual({ from: PAGE_SIZE * 2, to: PAGE_SIZE * 3 - 1 });
    expect(pageRange(1, 5)).toEqual({ from: 5, to: 9 });
  });
});

describe('countTotalPages', () => {
  it('never drops below one page', () => {
    expect(countTotalPages(0)).toBe(1);
    expect(countTotalPages(null)).toBe(1);
  });

  it('rounds partial pages up', () => {
    expect(countTotalPages(PAGE_SIZE + 1)).toBe(2);
    expect(countTotalPages(11, 5)).toBe(3);
  });
});

describe('paginated', () => {
  it('normalizes a missing count to zero', () => {
    expect(paginated(['a'], null, 0)).toEqual({ items: ['a'], total: 0, page: 0, totalPages: 1 });
  });

  it('keeps the requested page and derived page count', () => {
    expect(paginated(['a'], 41, 2)).toEqual({ items: ['a'], total: 41, page: 2, totalPages: 3 });
  });
});

describe('emptyPage', () => {
  it('describes an empty first page by default', () => {
    expect(emptyPage()).toEqual({ items: [], total: 0, page: 0, totalPages: 1 });
    expect(emptyPage(3).page).toBe(3);
  });
});
