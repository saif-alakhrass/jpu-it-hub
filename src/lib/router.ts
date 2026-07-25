import { useEffect, useState, useCallback } from 'react';

export interface Route {
  path: string;
  params: Record<string, string>;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts.length === 0) return { path: '/', params: {} };
  if (parts[0] === 'subject' && parts[1]) {
    return { path: '/subject/:id', params: { id: decodeURIComponent(parts[1]) } };
  }
  if (parts[0] === 'admin') return { path: '/admin', params: {} };
  if (parts[0] === 'auth') return { path: '/auth', params: {} };
  if (parts[0] === 'about') return { path: '/about', params: {} };
  if (parts[0] === 'profile') return { path: '/profile', params: {} };
  return { path: '/', params: {} };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    const target = to.startsWith('#') ? to : `#${to}`;
    if (window.location.hash === target) {
      setRoute(parse());
    } else {
      window.location.hash = target;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { route, navigate };
}
