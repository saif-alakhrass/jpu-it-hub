import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageScroller, pageScrollTop, scrollPageTo } from '@/lib/scroll';

describe('mobile page scrolling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses body when mobile overflow makes it the real scroll container', () => {
    Object.defineProperties(document.body, {
      scrollHeight: { configurable: true, value: 2400 },
      clientHeight: { configurable: true, value: 800 },
      scrollTop: { configurable: true, writable: true, value: 640 },
    });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'auto' } as CSSStyleDeclaration);
    const scrollTo = vi.fn();
    document.body.scrollTo = scrollTo;

    expect(pageScroller()).toBe(document.body);
    expect(pageScrollTop()).toBe(640);

    scrollPageTo(640);
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' });
  });

  it('falls back to the document scrolling element', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'visible' } as CSSStyleDeclaration);

    expect(pageScroller()).toBe(document.scrollingElement ?? document.documentElement);
  });
});
