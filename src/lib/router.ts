import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

export interface Route {
  path: string;
  params: Record<string, string>;
}

export function useRouter() {
  const location = useLocation();
  const navigateRR = useNavigate();
  const params = useParams();
  const scrollKey = `jpu-it-hub:scroll:${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    const savedPosition = sessionStorage.getItem(scrollKey);
    if (savedPosition === null) {
      window.scrollTo(0, 0);
      return;
    }
    const target = Number(savedPosition);
    if (!Number.isFinite(target) || target <= 0) {
      window.scrollTo(0, 0);
      return;
    }

    let cancelled = false;
    let frame = 0;
    let retries = 0;
    const restore = () => {
      if (cancelled) return;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= target) {
        window.scrollTo(0, target);
        return;
      }
      // Subject pages first render a small loading state, then grow after their
      // data arrives. Retry while content is expanding instead of restoring to
      // a position that the initial page height cannot represent.
      if (retries++ < 20) window.setTimeout(restore, 100);
    };
    frame = requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [scrollKey]);

  const route: Route = {
    path: location.pathname,
    params: params as Record<string, string>,
  };

  const navigate = useCallback(
    (to: string) => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
      const target = to.startsWith('#') ? to.slice(1) : to;
      navigateRR(target);
    },
    [navigateRR, scrollKey],
  );

  return { route, navigate };
}
