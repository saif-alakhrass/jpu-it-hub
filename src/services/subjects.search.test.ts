import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subject } from '@/lib/types';
import { PAGE_SIZE } from '@/lib/constants';
const mocks = vi.hoisted(() => ({
  rows: [] as Subject[],
  fail: false,
  ranges: [] as number[],
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        order: () => query,
        range: async (from: number, to: number) => {
          mocks.ranges.push(from);
          return {
            data: mocks.rows.slice(from, to + 1),
            error: mocks.fail ? new Error('offline') : null,
          };
        },
      };
      return query;
    },
  },
}));
import { fetchSubjectsPaged, searchSubjectsPaged } from './subjects';
const course = (id: number): Subject =>
  ({
    id: String(id),
    name: 'البرمجة المتقدمة',
    departments: ['علم الحاسوب'],
    code: String(id),
    description: '',
  }) as Subject;
beforeEach(() => {
  mocks.rows = [];
  mocks.ranges = [];
  mocks.fail = false;
});
describe('subject search across the catalog', () => {
  it('finds names beyond the first server page and respects the selected major', async () => {
    mocks.rows = Array.from({ length: 501 }, (_, i) => ({
      ...course(i),
      name: i === 500 ? 'البرمجة المتقدمة' : 'شبكات',
    }));
    const result = await fetchSubjectsPaged(0, 'برمجه متقدمه', 'علم الحاسوب');
    expect(result.items.map((s) => s.id)).toEqual(['500']);
    expect(result.total).toBe(1);
    expect(mocks.ranges).toEqual([0, 500]);
  });
  it('filters before slicing pages and includes all shared departments', () => {
    const courses = Array.from({ length: PAGE_SIZE + 2 }, (_, i) => course(i));
    courses.push({ ...course(1000), departments: ['الأمن السيبراني'] });
    const result = searchSubjectsPaged(courses, 1, 'متقدمه', 'علم الحاسوب');
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(PAGE_SIZE + 2);
    expect(result.totalPages).toBe(2);
    expect(
      searchSubjectsPaged(
        [{ ...course(1), departments: ['علم الحاسوب', 'الأمن السيبراني'] }],
        0,
        'متقدمه',
        'الأمن السيبراني',
      ).total,
    ).toBe(1);
  });
  it('does not interpolate search punctuation into a database filter and reports errors', async () => {
    expect((await fetchSubjectsPaged(0, '%,name.eq.fake')).items).toEqual([]);
    mocks.fail = true;
    await expect(fetchSubjectsPaged(0, 'متقدمه')).rejects.toThrow();
  });
});
