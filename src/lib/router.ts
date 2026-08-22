import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { pageScrollTop } from '@/lib/scroll';

export interface Route {
  path: string;
  params: Record<string, string>;
}

export function useRouter() {
  const location = useLocation();
  const navigateRR = useNavigate();
  const params = useParams();
  const scrollKey = `jpu-it-hub:scroll:${location.pathname}${location.search}${location.hash}`;
  const route: Route = {
    path: location.pathname,
    params: params as Record<string, string>,
  };

  const navigate = useCallback(
    (to: string) => {
      // Capture synchronously before React Router replaces the current route.
      // This is the reliable path for course cards on touch devices, where a
      // final scroll event is not guaranteed before a tap.
      // `overflow-x: hidden` makes `body` the scroll container on several
      // mobile browsers. `window.scrollY` stays at zero in that layout, so it
      // would overwrite the real saved position just before navigation.
      sessionStorage.setItem(scrollKey, String(pageScrollTop()));
      const target = to.startsWith('#') ? to.slice(1) : to;
      navigateRR(target);
    },
    [navigateRR, scrollKey],
  );

  const goBack = useCallback(() => {
    sessionStorage.setItem(scrollKey, String(pageScrollTop()));
    navigateRR(-1);
  }, [navigateRR, scrollKey]);

  return { route, navigate, goBack };
}
