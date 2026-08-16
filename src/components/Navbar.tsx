import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { scrollPageTo } from '@/lib/scroll';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/lib/router';
import { NotificationBell } from '@/components/NotificationBell';
import { getUserErrorMessage } from '@/lib/serviceError';

function initials(name: string | null | undefined): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2);
  return ((parts[0] ?? '')[0] ?? '') + ((parts[1] ?? '')[0] ?? '');
}

const ROLE_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  admin: { label: 'مدير', cls: 'bg-accent-500/20 text-accent-400 border-accent-500/40', icon: 'ShieldCheck' },
  trusted: { label: 'موثوق', cls: 'bg-brand-500/20 text-brand-300 border-brand-500/40', icon: 'Shield' },
  student: { label: 'طالب', cls: 'bg-ink-700 text-slate-300 border-white/10', icon: 'GraduationCap' },
};

export function Navbar() {
  const { session, profile, isAdmin, signOut } = useAuth();
  const { navigate, route } = useRouter();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
    } catch (err) {
      setSignOutError(getUserErrorMessage(err, 'تعذر تسجيل الخروج. حاول مجددًا.'));
    }
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  function openAbout() {
    // Keep the source-page position, but always start the standalone About
    // page at its beginning.
    sessionStorage.removeItem('jpu-it-hub:scroll:/about');
    sessionStorage.setItem('jpu-it-hub:scroll-reset', '/about');
    navigate('/about');
    // React Router can ignore navigation to the same URL. In that case there
    // is no route effect to reset the page, so reset it on the next frame too.
    requestAnimationFrame(() => scrollPageTo(0));
  }

  const roleBadge = (() => {
    if (!profile) return null;
    const info = ROLE_BADGE[profile.role] ?? ROLE_BADGE.student!;
    return (
      <span className={`badge border ${info.cls}`}>
        <Icon name={info.icon} className="h-3 w-3" />
        {info.label}
      </span>
    );
  })();

  const avatar = (
    <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-sm font-extrabold text-brand-700 transition hover:ring-2 hover:ring-brand-200">
      {initials(profile?.full_name)}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-ink-600 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 transition hover:opacity-90">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
            <Icon name="GraduationCap" className="h-5 w-5" />
          </span>
          <div className="text-right leading-tight">
            <div className="text-sm font-extrabold text-slate-100">JPU-IT Hub</div>
            <div className="text-[11px] text-slate-400">جامعة جرش - كلية الـ IT</div>
          </div>
        </button>
        <nav className="hidden items-center gap-2 md:flex">
          <button onClick={() => navigate('/')} className={`btn-ghost ${route.path === '/' ? 'border-brand-200 bg-brand-50 text-brand-700' : ''}`}>
            <Icon name="Home" className="h-4 w-4" /> الرئيسية
          </button>
          <button onClick={openAbout} className={`btn-ghost ${route.path === '/about' ? 'border-brand-200 bg-brand-50 text-brand-700' : ''}`}>
            <Icon name="Info" className="h-4 w-4" /> من نحن
          </button>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} className={`btn-ghost ${route.path === '/admin' ? 'border-brand-200 bg-brand-50 text-brand-700' : ''}`}>
              <Icon name="ShieldCheck" className="h-4 w-4" /> لوحة الإدارة
            </button>
          )}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {session ? (
            <>
            <NotificationBell />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-xl border border-white/5 bg-ink-800 px-2 py-1.5 transition hover:bg-ink-700">
                {avatar}
                <Icon name="ChevronDown" className={`h-4 w-4 text-slate-400 transition ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              {menuOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 origin-top-left animate-scaleIn rounded-2xl border border-white/10 bg-ink-850 p-2 shadow-card">
                  <div className="mb-2 rounded-xl bg-ink-900/60 p-3">
                    <p className="truncate text-sm font-bold text-slate-100">{profile?.full_name ?? 'مستخدم'}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400" dir="ltr">{session.user.email}</p>
                    <div className="mt-2">{roleBadge}</div>
                  </div>
                  <button onClick={() => { setMenuOpen(false); navigate('/profile'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-ink-700">
                    <Icon name="User" className="h-4 w-4 text-brand-400" /> الملف الشخصي
                  </button>
                  <button onClick={() => { setMenuOpen(false); navigate('/'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-ink-700">
                    <Icon name="Home" className="h-4 w-4 text-slate-400" /> الرئيسية
                  </button>
                  {isAdmin && (
                    <button onClick={() => { setMenuOpen(false); navigate('/admin'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-ink-700">
                      <Icon name="ShieldCheck" className="h-4 w-4 text-accent-400" /> لوحة الإدارة
                    </button>
                  )}
                  <div className="my-1 h-px bg-white/5" />
                  <button onClick={() => { setMenuOpen(false); void handleSignOut(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-danger-400 transition hover:bg-danger-500/10">
                    <Icon name="LogOut" className="h-4 w-4" /> تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
            </>
          ) : (
            <button onClick={() => navigate('/auth')} className="btn-primary">
              <Icon name="Lock" className="h-4 w-4" /> تسجيل الدخول
            </button>
          )}
        </div>
        <button className="rounded-lg p-2 text-slate-300 hover:bg-white/5 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="القائمة">
          <Icon name="Menu" className="h-6 w-6" />
        </button>
      </div>
      {open && (
        <div className="border-t border-white/5 bg-ink-900/95 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            <button onClick={() => { navigate('/'); setOpen(false); }} className="btn-ghost justify-start">
              <Icon name="Home" className="h-4 w-4" /> الرئيسية
            </button>
            <button onClick={() => { openAbout(); setOpen(false); }} className="btn-ghost justify-start">
              <Icon name="Info" className="h-4 w-4" /> من نحن
            </button>
            {isAdmin && (
              <button onClick={() => { navigate('/admin'); setOpen(false); }} className="btn-ghost justify-start">
                <Icon name="ShieldCheck" className="h-4 w-4" /> لوحة الإدارة
              </button>
            )}
            {session ? (
              <>
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-sm text-slate-300">{profile?.full_name}</span>
                  {roleBadge}
                </div>
                <button onClick={() => { navigate('/profile'); setOpen(false); }} className="btn-ghost justify-start">
                  <Icon name="User" className="h-4 w-4" /> الملف الشخصي
                </button>
                <div className="px-2 py-1"><NotificationBell /></div>
                <button onClick={() => { void handleSignOut(); setOpen(false); }} className="btn-ghost justify-start text-danger-400">
                  <Icon name="LogOut" className="h-4 w-4" /> خروج
                </button>
              </>
            ) : (
              <button onClick={() => { navigate('/auth'); setOpen(false); }} className="btn-primary">
                <Icon name="Lock" className="h-4 w-4" /> تسجيل الدخول
              </button>
            )}
          </div>
        </div>
      )}
      {signOutError && (
        <div className="border-t border-danger-500/30 bg-danger-500/10 px-4 py-2 text-center text-sm text-danger-400">
          {signOutError}
        </div>
      )}
    </header>
  );
}
