import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function keyFor(pathname: string, search: string, hash: string) {
  return `jpu-it-hub:scroll:${pathname}${search}${hash}`;
}

/**
 * The app deliberately makes body the scroll container (to prevent horizontal
 * overflow on mobile). In that layout window.scrollY remains zero, so using
 * the window APIs loses every saved position.
 */
function pageScroller(): HTMLElement {
  const body = document.body;
  const bodyOverflow = window.getComputedStyle(body).overflowY;
  if (body.scrollHeight > body.clientHeight && /auto|scroll/.test(bodyOverflow)) {
    return body;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function pageScrollTop() {
  return pageScroller().scrollTop;
}

export function scrollPageTo(top: number) {
  pageScroller().scrollTo({ top, behavior: 'auto' });
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
    let frame = 0;
    const scroller = pageScroller();
    const save = () => sessionStorage.setItem(storageKey, String(pageScrollTop()));
    const scheduleSave = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        save();
      });
    };

    scroller.addEventListener('scroll', scheduleSave, { passive: true });
    // Save before React handles a link/button event and replaces the current
    // route's DOM. This keeps the real position when the next route is shorter.
    window.addEventListener('pointerdown', save, { capture: true, passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', scheduleSave);
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
