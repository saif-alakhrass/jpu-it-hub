import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMinuteNow } from './useMinuteNow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('uses one minute-aligned clock and pauses it while hidden', () => {
  vi.useFakeTimers();
  const start = Date.parse('2026-09-06T07:59:40Z');
  vi.setSystemTime(start);
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const { result, unmount } = renderHook(useMinuteNow);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(20_000));
  expect(result.current).toBe(start + 20_000);
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(120_000));
  expect(result.current).toBe(start + 20_000);
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(result.current).toBe(start + 140_000);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
