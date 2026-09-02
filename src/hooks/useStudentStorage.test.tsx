import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudentStorage } from './useStudentStorage';
import {
  emptySemester,
  newCourse,
  parseSemester,
  STUDENT_STORAGE_KEY,
} from '@/lib/studentAssistant';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('local-first semester storage', () => {
  it('restores courses and incomplete inputs after a remount', () => {
    const { result, unmount } = renderHook(useStudentStorage);
    act(() =>
      result.current.update((d) => ({
        ...d,
        name: 'طالب',
        courses: [newCourse()],
      })),
    );
    act(() => vi.advanceTimersByTime(350));
    unmount();
    const next = renderHook(useStudentStorage);
    expect(next.result.current.data.name).toBe('طالب');
    expect(next.result.current.data.courses[0]?.grade).toBe('');
  });
  it('flushes the last edit on pagehide before the debounce fires', () => {
    const { result } = renderHook(useStudentStorage);
    act(() => {
      result.current.update((d) => ({ ...d, name: 'آخر حرف' }));
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(parseSemester(localStorage.getItem(STUDENT_STORAGE_KEY)!).name).toBe(
      'آخر حرف',
    );
  });
  it('does not overwrite corrupt or future-version storage just by opening', () => {
    localStorage.setItem(STUDENT_STORAGE_KEY, '{bad');
    const { result } = renderHook(useStudentStorage);
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.error).not.toBe('');
    expect(localStorage.getItem(STUDENT_STORAGE_KEY)).toBe('{bad');
    expect(() =>
      parseSemester(JSON.stringify({ ...emptySemester(), version: 2 })),
    ).toThrow();
  });
  it('keeps inputs usable and reports quota failures', () => {
    const { result } = renderHook(useStudentStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    act(() =>
      result.current.update((d) => ({ ...d, name: 'محفوظ في الذاكرة' })),
    );
    act(() => vi.advanceTimersByTime(350));
    expect(result.current.data.name).toBe('محفوظ في الذاكرة');
    expect(result.current.error).toContain('تعذر الحفظ');
  });
  it('rejects oversized and duplicate nested state', () => {
    const c = newCourse();
    expect(() =>
      parseSemester(JSON.stringify({ ...emptySemester(), courses: [c, c] })),
    ).toThrow();
    expect(() => parseSemester(' '.repeat(250_001))).toThrow();
    expect(() =>
      parseSemester(
        JSON.stringify({
          ...emptySemester(),
          courses: [
            { ...c, meetings: [{ id: 'x', days: [7], start: '', end: '' }] },
          ],
        }),
      ),
    ).toThrow();
  });
});
