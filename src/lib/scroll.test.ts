import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageScrollTop, pageScroller, scrollPageTo } from './scroll';

function stubBodyMetrics(scrollHeight: number, clientHeight: number, overflowY: string) {
  vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
  vi.spyOn(document.body, 'clientHeight', 'get').mockReturnValue(clientHeight);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY } as CSSStyleDeclaration);
}

beforeEach(() => {
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document.body, 'scrollTo');
});

describe('pageScroller', () => {
  it('uses body when body is the scrolling container', () => {
    stubBodyMetrics(2000, 800, 'auto');
    expect(pageScroller()).toBe(document.body);
  });

  it('falls back to the scrolling element when body does not overflow', () => {
    stubBodyMetrics(800, 800, 'auto');
    expect(pageScroller()).toBe(document.documentElement);
  });

  it('falls back to the scrolling element when body overflow is not scrollable', () => {
    stubBodyMetrics(2000, 800, 'visible');
    expect(pageScroller()).toBe(document.documentElement);
  });
});

describe('page scroll position', () => {
  it('reads the offset from the active scroller', () => {
    stubBodyMetrics(2000, 800, 'scroll');
    document.body.scrollTop = 120;
    expect(pageScrollTop()).toBe(120);
  });

  it('scrolls the active scroller without smooth behavior', () => {
    stubBodyMetrics(2000, 800, 'scroll');
    // jsdom does not implement Element.scrollTo.
    const scrollTo = vi.fn();
    document.body.scrollTo = scrollTo;
    scrollPageTo(240);
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: 'auto' });
  });
});
