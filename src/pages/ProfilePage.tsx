import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Toast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { ACADEMIC_YEARS, MAJORS, type Role } from '@/lib/types';

const ROLE_LABEL: Record<Role, { label: string; cls: string; icon: string }> = {
  admin: { label: 'مدير', cls: 'bg-accent-500/20 text-accent-400 border-accent-500/40', icon: 'ShieldCheck' },
  trusted: { label: 'موثوق', cls: 'bg-brand-500/20 text-brand-300 border-brand-500/40', icon: 'Shield' },
  student: { label: 'طالب', cls: 'bg-ink-700 text-slate-300 border-white/10', icon: 'GraduationCap' },
};

function initials(name: string | null | undefined): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}

export function ProfilePage() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { navigate } = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [fullName, setFullName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [department, setDepartment] = useState('');
  const [creditHours, setCreditHours] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (!session) { navigate('/auth'); return; }
  }, [session, navigate]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setAcademicYear(profile.academic_year ?? '');
      setDepartment(profile.department ?? '');
      setCreditHours(profile.credit_hours != null ? String(profile.credit_hours) : '');
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  if (!session || !profile) {
    return <div className="mx-auto max-w-4xl px-4 py-20 text-center"><Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" /></div>;
  }

  const roleInfo = ROLE_LABEL[profile.role] ?? ROLE_LABEL.student;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        academic_year: academicYear || null,
        department: department || null,
        credit_hours: creditHours ? parseInt(creditHours, 10) : null,
        bio: bio.trim() || null,
      })
      .eq('id', profile!.id);
    setSaving(false);
    if (error) { setToast({ message: 'فشل حفظ التغييرات', type: 'error' }); return; }
    await refreshProfile();
    setEditing(false);
    setToast({ message: 'تم حفظ الملف الشخصي بنجاح', type: 'success' });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button onClick={() => navigate('/')} className="mb-5 flex items-center gap-1 text-sm text-slate-400 hover:text-brand-300 transition">
        <Icon name="ChevronLeft" className="h-4 w-4" /> العودة للرئيسية
      </button>

      <div className="card mb-6 overflow-hidden">
        <div className="relative h-28 bg-gradient-to-l from-brand-600/30 via-ink-800 to-ink-850">
          <div className="absolute -bottom-10 right-6 flex items-end gap-4">
            <div className="grid h-20 w-20 place-items-center rounded-2xl border-4 border-ink-850 bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-extrabold text-ink-950 shadow-glow">{initials(profile.full_name)}</div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-extrabold text-slate-100">{profile.full_name ?? 'مستخدم'}</h1>
              <p className="mt-0.5 text-sm text-slate-400" dir="ltr">{session.user.email}</p>
            </div>
            <span className={`badge border self-start ${roleInfo.cls}`}><Icon name={roleInfo.icon} className="h-3.5 w-3.5" />{roleInfo.label}</span>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100"><Icon name="GraduationCap" className="h-5 w-5 text-brand-400" /> التفاصيل الأكاديمية</h2>
          {!editing && <button onClick={() => setEditing(true)} className="btn-ghost"><Icon name="Settings" className="h-4 w-4" /> تعديل</button>}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-300">الاسم الكامل</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="اسمك الكامل..." className="input" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-300">السنة الدراسية</label>
                <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="input">
                  <option value="" className="bg-ink-900">— اختر —</option>
                  {ACADEMIC_YEARS.map((y) => <option key={y} value={y} className="bg-ink-900">{y}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-300">التخصص</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input">
                  <option value="" className="bg-ink-900">— اختر —</option>
                  {MAJORS.map((m) => <option key={m} value={m} className="bg-ink-900">{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-300">الساعات المقطوعة</label>
              <input type="number" min="0" max="200" value={creditHours} onChange={(e) => setCreditHours(e.target.value)} placeholder="مثال: 64" className="input" dir="ltr" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-300">نبذة شخصية</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="اكتب نبذة قصيرة عنك..." className="input resize-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">إلغاء</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Save" className="h-4 w-4" />} حفظ
              </button>
            </div>
          </form>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem icon="BookMarked" label="السنة الدراسية" value={profile.academic_year} />
            <DetailItem icon="Layers" label="التخصص" value={profile.department} />
            <DetailItem icon="Hash" label="الساعات المقطوعة" value={profile.credit_hours != null ? String(profile.credit_hours) : null} ltr />
            <DetailItem icon="User" label="نبذة شخصية" value={profile.bio} full />
          </div>
        )}
      </div>

      <div className="card mt-6 flex items-center justify-between p-6">
        <div>
          <h3 className="font-bold text-slate-200">إدارة الحساب</h3>
          <p className="text-sm text-slate-400">تسجيل الخروج من المنصة</p>
        </div>
        <button onClick={() => signOut().then(() => navigate('/'))} className="btn-ghost text-danger-400 hover:bg-danger-500/10">
          <Icon name="LogOut" className="h-4 w-4" /> خروج
        </button>
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function DetailItem({ icon, label, value, full, ltr }: { icon: string; label: string; value: string | null; full?: boolean; ltr?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/5 bg-ink-900/50 p-4 ${full ? 'sm:col-span-2' : ''}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><Icon name={icon} className="h-3.5 w-3.5" />{label}</div>
      {value ? <p className="text-sm font-medium text-slate-200" dir={ltr ? 'ltr' : undefined}>{value}</p> : <p className="text-sm text-slate-600">— غير محدد —</p>}
    </div>
  );
}
