import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { fetchNotifications, markNotificationsRead } from '@/services/notifications';
import type { AppNotification } from '@/lib/types';

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return new Date(value).toLocaleDateString('ar');
}

function iconFor(type: AppNotification['type']) {
  if (type === 'file_approved') return { icon: 'CheckCircle', color: 'text-brand-300 bg-brand-500/10' };
  if (type === 'file_rejected') return { icon: 'FileWarning', color: 'text-danger-400 bg-danger-500/10' };
  if (type === 'new_summary') return { icon: 'BookOpen', color: 'text-accent-400 bg-accent-500/10' };
  return { icon: 'Pencil', color: 'text-sky-300 bg-sky-500/10' };
}

export function NotificationBell() {
  const { session } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const refresh = useCallback(async (): Promise<AppNotification[]> => {
    if (!session?.user.id) return [];
    setLoading(true);
    try { const nextItems = await fetchNotifications(session.user.id); setItems(nextItems); return nextItems; } finally { setLoading(false); }
  }, [session?.user.id]);

  useEffect(() => {
    // Keep the unread badge useful without competing with the initial page
    // content on slower mobile connections.
    const timer = window.setTimeout(() => { void refresh(); }, 800);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    function close(event: MouseEvent) { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); }
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function toggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen) return;
    const refreshed = await refresh();
    const unreadTargeted = refreshed.filter((item) => item.recipient_id && !item.read_at).map((item) => item.id);
    if (unreadTargeted.length > 0) {
      void markNotificationsRead(unreadTargeted);
      setItems((current) => current.map((item) => unreadTargeted.includes(item.id) ? { ...item, read_at: new Date().toISOString() } : item));
    }
  }

  const unread = items.filter((item) => item.recipient_id && !item.read_at).length;
  return <div className="relative" ref={rootRef}>
    <button onClick={() => void toggle()} className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/5 bg-ink-800 text-slate-300 transition hover:bg-ink-700 hover:text-brand-300" aria-label="الإشعارات" title="الإشعارات"><Icon name="Bell" className="h-4 w-4" />{unread > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand-400 px-1 text-[10px] font-extrabold text-ink-950">{unread > 9 ? '9+' : unread}</span>}</button>
    {open && <div className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-ink-850 shadow-card" dir="rtl"><div className="flex items-center justify-between border-b border-white/5 px-4 py-3"><p className="font-bold text-slate-100">الإشعارات</p><button onClick={() => void refresh()} className="rounded-lg p-1 text-slate-400 transition hover:bg-ink-700" title="تحديث"><Icon name={loading ? 'Loader2' : 'RefreshCw'} className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div><div className="max-h-[min(28rem,65vh)] overflow-y-auto p-2">{loading && items.length === 0 ? <div className="grid place-items-center py-10"><Icon name="Loader2" className="h-5 w-5 animate-spin text-brand-400" /></div> : items.length === 0 ? <p className="px-3 py-8 text-center text-sm text-slate-500">لا توجد إشعارات جديدة.</p> : items.map((item) => { const visual = iconFor(item.type); return <article key={item.id} className={`flex gap-3 rounded-xl p-3 transition hover:bg-ink-800 ${item.recipient_id && !item.read_at ? 'bg-brand-500/[0.035]' : ''}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${visual.color}`}><Icon name={visual.icon} className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold text-slate-200">{item.title}</p><time className="shrink-0 text-[11px] text-slate-500">{relativeTime(item.created_at)}</time></div><p className="mt-0.5 text-xs leading-5 text-slate-400">{item.message}</p></div></article>; })}</div></div>}
  </div>;
}
