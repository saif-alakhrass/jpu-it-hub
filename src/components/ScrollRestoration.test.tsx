import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pageScrollTop, scrollPageTo } = vi.hoisted(() => ({
  pageScrollTop: vi.fn(() => 420),
  scrollPageTo: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/', search: '', hash: '', key: 'home' }),
}));

vi.mock('@/lib/scroll', () => ({
  pageScroller: () => document.documentElement,
  pageScrollTop,
  scrollPageTo,
}));

import { ScrollRestoration } from './ScrollRestoration';

describe('ScrollRestoration touch performance', () => {
  beforeEach(() => {
    sessionStorage.clear();
    pageScrollTop.mockClear();
    scrollPageTo.mockClear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
  });

  it('does no storage work at touch start and saves after a completed click', () => {
    render(<ScrollRestoration />);

    fireEvent.pointerDown(window);
    expect(pageScrollTop).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('jpu-it-hub:scroll:/')).toBeNull();

    fireEvent.click(window);
    expect(pageScrollTop).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('jpu-it-hub:scroll:/')).toBe('420');
  });
});
