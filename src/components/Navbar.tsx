import { useState } from 'react';
import { Icon } from './Icon';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';

export function Navbar() {
  const { session, profile, isAdmin, signOut } = useAuth();
  const { navigate, route } = useRouter();
  const [open, setOpen] = useState(false);

  const roleBadge = (() => {
    if (!profile) return null;
    const map = {
      admin: { label: 'مدير', cls: 'bg-accent-500/20 text-accent-400 border-accent-500/40', icon: 'ShieldCheck' },
      trusted: { label: 'موثوق', cls: 'bg-brand-500/20 text-brand-300 border-brand-500/40', icon: 'Shield' },
      student: { label: 'طالب', cls: 'bg-ink-700 text-slate-300 border-white/10', icon: 'GraduationCap' },
    }[profile.role];
    return (
      <span className={`badge border ${map.cls}`}>
        <Icon name={map.icon} className="h-3 w-3" />
        {map.label}
      </span>
    );
  })();

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5 transition hover:opacity-90">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-ink-950 shadow-glow">
            <Icon name="GraduationCap" className="h-5 w-5" />
          </span>
          <div className="text-right leading-tight">
            <div className="text-sm font-extrabold text-slate-100">JPU-IT Hub</div>
            <div className="text-[11px] text-slate-400">جامعة جرش - كلية الـ IT</div>
          </div>
        </button>

        <nav className="hidden items-center gap-2 md:flex">
          <button onClick={() => navigate('/')} className={`btn-ghost ${route.path === '/' ? 'bg-ink-700 text-brand-300' : ''}`}>
            <Icon name="Home" className="h-4 w-4" /> الرئيسية
          </button>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} className={`btn-ghost ${route.path === '/admin' ? 'bg-ink-700 text-accent-400' : ''}`}>
              <Icon name="ShieldCheck" className="h-4 w-4" /> لوحة الإدارة
            </button>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {session ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">{profile?.full_name}</span>
                {roleBadge}
              </div>
              <button onClick={signOut} className="btn-ghost">
                <Icon name="LogOut" className="h-4 w-4" /> خروج
              </button>
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
                <button onClick={() => { signOut(); setOpen(false); }} className="btn-ghost justify-start">
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
    </header>
  );
}
