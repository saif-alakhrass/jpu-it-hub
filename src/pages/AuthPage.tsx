import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';

export function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { navigate } = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, fullName);
      if (res.error) { setError(res.error); return; }
      if (res.notice) { setNotice(res.notice); return; }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع، حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-1 text-sm text-slate-400 hover:text-brand-300 transition self-start">
        <Icon name="ChevronLeft" className="h-4 w-4" /> العودة للرئيسية
      </button>
      <div className="card p-8 animate-slideUp">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-ink-950 shadow-glow">
            <Icon name="GraduationCap" className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-extrabold text-slate-100">{mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h1>
          <p className="mt-1 text-sm text-slate-400">{mode === 'signin' ? 'ادخل للوصول لرفع الموارد' : 'انضم لمجتمع JPU-IT'}</p>
        </div>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger-500/40 bg-danger-500/10 p-3 text-sm text-danger-400">
            <Icon name="AlertCircle" className="h-5 w-5 shrink-0" /><span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <Icon name="CheckCircle" className="h-5 w-5 shrink-0" /><span>{notice}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-300">الاسم الكامل</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="اسمك..." className="input" />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="input" dir="ltr" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">كلمة المرور</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" className="input" dir="ltr" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Lock" className="h-4 w-4" />}
            {mode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
          </button>
        </form>
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" /><span className="text-xs text-slate-500">أو</span><div className="h-px flex-1 bg-white/10" />
        </div>
        <button onClick={signInWithGoogle} className="btn-ghost w-full">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>
          الدخول عبر Google
        </button>
        <p className="mt-6 text-center text-sm text-slate-400">
          {mode === 'signin' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }} className="ms-1 font-bold text-brand-400 hover:text-brand-300">
            {mode === 'signin' ? 'أنشئ حساباً' : 'سجّل الدخول'}
          </button>
        </p>
      </div>
    </div>
  );
}
