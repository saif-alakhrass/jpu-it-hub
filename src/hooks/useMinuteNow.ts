import { useEffect, useState } from 'react';

/** One aligned clock for the small agenda, paused while the page is hidden. */
export function useMinuteNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      const current = Date.now();
      setNow(current);
      timer = window.setTimeout(refresh, 60_000 - (current % 60_000));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return now;
}
