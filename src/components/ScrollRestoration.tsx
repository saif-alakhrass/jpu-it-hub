import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function keyFor(pathname: string, search: string, hash: string) {
  return `jpu-it-hub:scroll:${pathname}${search}${hash}`;
}

/**
 * Persists position continuously, rather than only in click handlers. This
 * covers browser back/forward gestures on mobile and navigation triggered by
 * any component. Restoration waits until async page content is tall enough.
 */
export function ScrollRestoration() {
  const { pathname, search, hash } = useLocation();
  const storageKey = keyFor(pathname, search, hash);

  useEffect(() => {
    let frame = 0;
    const save = () => sessionStorage.setItem(storageKey, String(window.scrollY));
    const scheduleSave = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        save();
      });
    };

    window.addEventListener('scroll', scheduleSave, { passive: true });
    // Save before React handles a link/button event and replaces the current
    // route's DOM. This keeps the real position when the next route is shorter.
    window.addEventListener('pointerdown', save, { capture: true, passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleSave);
      window.removeEventListener('pointerdown', save, { capture: true });
      window.removeEventListener('pagehide', save);
    };
  }, [storageKey]);

  useEffect(() => {
    const rawPosition = sessionStorage.getItem(storageKey);
    const target = rawPosition === null ? 0 : Number(rawPosition);
    if (!Number.isFinite(target) || target <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const restore = () => {
      if (cancelled) return;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= target) {
        window.scrollTo(0, target);
        return;
      }
      if (attempts++ < 30) window.setTimeout(restore, 100);
    };

    const observer = new ResizeObserver(restore);
    observer.observe(document.documentElement);
    requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [storageKey]);

  return null;
}
