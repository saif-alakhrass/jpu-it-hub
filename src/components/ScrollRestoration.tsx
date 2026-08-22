import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageScroller, pageScrollTop, scrollPageTo } from '@/lib/scroll';

function keyFor(pathname: string, search: string, hash: string) {
  return `jpu-it-hub:scroll:${pathname}${search}${hash}`;
}

/**
 * Persists position continuously, rather than only in click handlers. This
 * covers browser back/forward gestures on mobile and navigation triggered by
 * any component. Restoration waits until async page content is tall enough.
 */
export function ScrollRestoration() {
  const location = useLocation();
  const { pathname, search, hash } = location;
  const storageKey = keyFor(pathname, search, hash);

  useEffect(() => {
    // On mobile history navigation the browser may restore its own stale
    // position after React has rendered, overwriting our saved position.
    // Keep one source of truth: this component's persisted route position.
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const save = () => sessionStorage.setItem(storageKey, String(pageScrollTop()));

    // Save before React handles a link/button event and replaces the current
    // route's DOM. Route helpers also save synchronously. Deliberately avoid a
    // scroll listener: no storage writes or timers should run while a finger
    // is moving on a low-end phone.
    window.addEventListener('pointerdown', save, { capture: true, passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pointerdown', save, { capture: true });
      window.removeEventListener('pagehide', save);
    };
  }, [storageKey]);

  useEffect(() => {
    const resetPath = sessionStorage.getItem('jpu-it-hub:scroll-reset');
    if (resetPath === pathname) {
      sessionStorage.removeItem('jpu-it-hub:scroll-reset');
      scrollPageTo(0);
      return;
    }

    const rawPosition = sessionStorage.getItem(storageKey);
    const target = rawPosition === null ? 0 : Number(rawPosition);
    if (!Number.isFinite(target) || target <= 0) {
      scrollPageTo(0);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const restore = () => {
      if (cancelled) return;
      const scroller = pageScroller();
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      if (maxScroll >= target) {
        scrollPageTo(target);
        return;
      }
      if (attempts++ < 30) window.setTimeout(restore, 100);
    };

    const observer = new ResizeObserver(restore);
    observer.observe(document.body);
    requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname, storageKey, location.key]);

  return null;
}
