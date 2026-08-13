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
    const frame = requestAnimationFrame(() => window.scrollTo(0, Number(savedPosition)));
    return () => cancelAnimationFrame(frame);
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
