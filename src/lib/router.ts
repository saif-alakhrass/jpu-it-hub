import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

export interface Route {
  path: string;
  params: Record<string, string>;
}

export function useRouter() {
  const location = useLocation();
  const navigateRR = useNavigate();
  const params = useParams();
  const route: Route = {
    path: location.pathname,
    params: params as Record<string, string>,
  };

  const navigate = useCallback(
    (to: string) => {
      const target = to.startsWith('#') ? to.slice(1) : to;
      navigateRR(target);
    },
    [navigateRR],
  );

  return { route, navigate };
}
