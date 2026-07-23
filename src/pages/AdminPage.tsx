import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { TABS, type FileRow, type Profile } from '@/lib/types';

export function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [pending, setPending] = useState<FileRow[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'users'>('pending');
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function loadPending() {
    const { data } = await supabase
      .from('files')
      .select('id, subject_id, tab, title, storage_path, file_url, file_type, uploader_id, status, created_at, uploader:profiles!files_uploader_id_fkey(id, full_name, role), subject:subjects!files_subject_id_fkey(id, name, code)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPending((data ?? []) as unknown as FileRow[]);
  }

  async function loadUsers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: false });
    setStudents((data ?? []) as Profile[]);
  }

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([loadPending(), loadUsers()]).finally(() => setLoading(false));
  }, [isAdmin]);

  async function approve(id: string) {
    const { error } = await supabase.from('files').update({ status: 'approved' }).eq('id', id);
    if (error) {
      setToast({ message: 'فشل: ' + error.message, type: 'error' });
      return;
    }
    setToast({ message: 'تمت الموافقة على الملف ونشره', type: 'success' });
    setPending((prev) => prev.filter((f) => f.id !== id));
    setPreview(null);
  }

  async function reject(id: string, storagePath: string) {
    const { error } = await supabase.from('files').update({ status: 'rejected' }).eq('id', id);
    if (error) {
      setToast({ message: 'فشل: ' + error.message, type: 'error' });
      return;
    }
    // also remove the file from storage
    await supabase.storage.from('files').remove([storagePath]);
    setToast({ message: 'تم رفض الملف وحذفه', type: 'success' });
    setPending((prev) => prev.filter((f) => f.id !== id));
    setPreview(null);
  }

  async function promote(id: string, toRole: 'trusted' | 'student') {
    const { error } = await supabase.from('profiles').update({ role: toRole }).eq('id', id);
    if (error) {
      setToast({ message: 'فشل: ' + error.message, type: 'error' });
      return;
    }
    setToast({ message: toRole === 'trusted' ? 'تم ترقية المستخدم إلى موثوق' : 'تم تخفيض المستخدم إلى طالب', type: 'success' });
    await loadUsers();
  }

  if (authLoading) {
    return (
      <div className="py-20 text-center">
        <Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <Icon name="Lock" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
        <h1 className="text-xl font-bold text-slate-200">هذه الصفحة مخصصة للمدير فقط</h1>
        <p className="mt-1 text-slate-400">لا تملك صلاحية الوصول إلى لوحة الإدارة.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-100 md:text-3xl">
          <Icon name="ShieldCheck" className="h-7 w-7 text-accent-400" />
          لوحة الإدارة
        </h1>
        <p className="mt-1 text-slate-400">مراجعة الملفات وإدارة الثقة والصلاحيات.</p>
      </header>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-slate-400">ملفات قيد المراجعة</div>
          <div className="mt-1 text-2xl font-extrabold text-accent-400">{pending.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400">إجمالي المستخدمين</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-100">{students.length}</div>
        </div>
        <div className="card p-4 col-span-2 md:col-span-1">
          <div className="text-xs text-slate-400">مستخدمون موثوقون</div>
          <div className="mt-1 text-2xl font-extrabold text-brand-400">
            {students.filter((s) => s.role === 'trusted').length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-2 border-b border-white/5">
        <button
          onClick={() => setTab('pending')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
            tab === 'pending' ? 'border-accent-500 text-accent-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Icon name="Clock" className="h-4 w-4" />
          قيد المراجعة ({pending.length})
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${
            tab === 'users' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Icon name="Users" className="h-4 w-4" />
          المستخدمون والثقة
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="card p-12 text-center">
            <Icon name="Check" className="mx-auto mb-3 h-12 w-12 text-brand-500" />
            <p className="text-slate-300 font-bold">لا توجد ملفات بانتظار المراجعة</p>
            <p className="text-slate-500 text-sm mt-1">كل شيء تحت السيطرة!</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pending.map((f) => (
              <div key={f.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="badge bg-ink-700 text-slate-300 border border-white/5">
                      {TABS.find((t) => t.key === f.tab)?.label}
                    </span>
                    <span className="text-xs text-slate-500">{f.subject?.name} {f.subject?.code && <span className="font-mono text-slate-600">({f.subject.code})</span>}</span>
                  </div>
                  <h3 className="mt-1.5 truncate font-bold text-slate-100">{f.title}</h3>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <Icon name="GraduationCap" className="h-3.5 w-3.5" />
                    {f.uploader?.full_name ?? 'مستخدم'}
                    <span>·</span>
                    <span>{new Date(f.created_at).toLocaleDateString('ar')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreview(f)} className="btn-ghost" title="معاينة">
                    <Icon name="Eye" className="h-4 w-4" />
                  </button>
                  <button onClick={() => approve(f.id)} className="btn-primary">
                    <Icon name="Check" className="h-4 w-4" />
                    موافقة
                  </button>
                  <button onClick={() => reject(f.id, f.storage_path)} className="btn-danger">
                    <Icon name="Trash2" className="h-4 w-4" />
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-3">
          {students.map((u) => (
            <div key={u.id} className="card flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-700 text-slate-300 font-bold">
                {(u.full_name ?? '؟').slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-bold text-slate-100">{u.full_name ?? 'بدون اسم'}</h3>
                  <RoleBadge role={u.role} />
                </div>
                <div className="text-xs text-slate-500">{new Date(u.created_at).toLocaleDateString('ar')}</div>
              </div>
              {u.role !== 'admin' && (
                <div className="flex items-center gap-2">
                  {u.role === 'student' ? (
                    <button onClick={() => promote(u.id, 'trusted')} className="btn-primary" title="ترقية إلى موثوق">
                      <Icon name="Shield" className="h-4 w-4" />
                      ترقية لموثوق
                    </button>
                  ) : (
                    <button onClick={() => promote(u.id, 'student')} className="btn-ghost" title="إلغاء الثقة">
                      <Icon name="GraduationCap" className="h-4 w-4" />
                      تخفيض لطالب
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="معاينة الملف" maxWidth="max-w-3xl">
        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-ink-900 p-3">
              {isImageFile(preview.file_type) ? (
                <img src={preview.file_url} alt={preview.title} className="max-h-[60vh] mx-auto rounded-lg" />
              ) : isPdfFile(preview.file_type) ? (
                <iframe src={preview.file_url} title={preview.title} className="h-[60vh] w-full rounded-lg" />
              ) : (
                <div className="py-12 text-center">
                  <Icon name="File" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
                  <p className="text-slate-400">لا تتوفر معاينة لهذا النوع. افتح الملف في نافذة جديدة.</p>
                  <a href={preview.file_url} target="_blank" rel="noreferrer" className="btn-ghost mt-4">
                    <Icon name="Download" className="h-4 w-4" /> فتح الملف
                  </a>
                </div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-100">{preview.title}</h3>
              <p className="text-sm text-slate-400">
                {preview.uploader?.full_name} · {preview.subject?.name} {preview.subject?.code && <span className="font-mono text-slate-500">({preview.subject.code})</span>}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => reject(preview.id, preview.storage_path)} className="btn-danger">
                <Icon name="Trash2" className="h-4 w-4" /> رفض وحذف
              </button>
              <button onClick={() => approve(preview.id)} className="btn-primary">
                <Icon name="Check" className="h-4 w-4" /> موافقة ونشر
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    admin: { label: 'مدير', cls: 'bg-accent-500/20 text-accent-400 border-accent-500/40', icon: 'ShieldCheck' },
    trusted: { label: 'موثوق', cls: 'bg-brand-500/20 text-brand-300 border-brand-500/40', icon: 'Shield' },
    student: { label: 'طالب', cls: 'bg-ink-700 text-slate-300 border-white/10', icon: 'GraduationCap' },
  };
  const r = map[role] ?? map.student;
  return (
    <span className={`badge border ${r.cls}`}>
      <Icon name={r.icon} className="h-3 w-3" />
      {r.label}
    </span>
  );
}

function isImageFile(type?: string | null) {
  return !!type && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(type.toLowerCase());
}
function isPdfFile(type?: string | null) {
  return !!type && type.toLowerCase() === 'pdf';
}
