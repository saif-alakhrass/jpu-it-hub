successfully downloaded text file (SHA: d8bc67c2858cb0873662f0f1f4503dc8130869ff)
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { TABS, type FileRow, type Profile, type Subject, type FileStatus } from '@/lib/types';
import { MAJORS } from '@/lib/types';
import { getSignedFileUrl } from '@/lib/storage';

type AdminTab = 'pending' | 'subjects' | 'users';

export function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [pending, setPending] = useState<FileRow[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<FileRow[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>('pending');
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    const { data } = await supabase
      .from('files')
      .select('id, subject_id, tab, title, storage_path, file_url, file_type, file_size, uploader_id, status, created_at, batch_id, uploader:profiles!files_uploader_id_fkey(id, full_name, role), subject:subjects!files_subject_id_fkey(id, name, code)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPending((data ?? []) as unknown as FileRow[]);
  }, []);

  const loadRejectedFiles = useCallback(async () => {
    const { data } = await supabase
      .from('files')
      .select('id, subject_id, tab, title, storage_path, file_url, file_type, file_size, uploader_id, status, created_at, batch_id, uploader:profiles!files_uploader_id_fkey(id, full_name, role), subject:subjects!files_subject_id_fkey(id, name, code)')
      .eq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(50);
    setRejectedFiles((data ?? []) as unknown as FileRow[]);
  }, []);

  const loadRejectedCount = useCallback(async () => {
    const { count } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected');
    setRejectedCount(count ?? 0);
  }, []);

  const loadSubjects = useCallback(async () => {
    const { data } = await supabase
      .from('subjects')
      .select('id, name, code, description, major, departments, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setSubjects((data ?? []) as Subject[]);
  }, []);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setStudents((data ?? []) as Profile[]);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([loadPending(), loadRejectedFiles(), loadRejectedCount(), loadSubjects(), loadUsers()]).finally(() => setLoading(false));
  }, [isAdmin, loadPending, loadRejectedFiles, loadRejectedCount, loadSubjects, loadUsers]);

  async function setStatus(id: string, status: FileStatus, storagePath?: string, batchId?: string | null) {
    setBusyId(id);
    const { error } = await supabase.from('files').update({ status }).eq('id', id);
    if (error) {
      setToast({ message: 'فشل: ' + error.message, type: 'error' });
      setBusyId(null);
      return;
    }
    if (status === 'rejected' && storagePath) {
      await supabase.storage.from('files').remove([storagePath]);
      await supabase.from('files').delete().eq('id', id);
    }
    if (batchId && (status === 'approved' || status === 'rejected')) {
      await supabase.from('file_batches').update({ status }).eq('id', batchId);
    }
    setPending((prev) => prev.filter((f) => f.id !== id));
    await loadRejectedCount();
    await loadRejectedFiles();
    setToast({
      message: status === 'approved' ? 'تمت الموافقة على الملف ونشره' : 'تم رفض الملف وحذفه نهائياً',
      type: 'success',
    });
    setPreview(null);
    setSignedPreviewUrl(null);
    setBusyId(null);
  }

  const approve = (id: string, batchId?: string | null) => setStatus(id, 'approved', undefined, batchId);
  const reject = (id: string, storagePath: string, batchId?: string | null) => setStatus(id, 'rejected', storagePath, batchId);

  async function restore(id: string, batchId?: string | null) {
    setBusyId(id);
    const { error } = await supabase.from('files').update({ status: 'approved' }).eq('id', id);
    if (error) {
      setToast({ message: 'فشل: ' + error.message, type: 'error' });
      setBusyId(null);
      return;
    }
    if (batchId) {
      await supabase.from('file_batches').update({ status: 'approved' }).eq('id', batchId);
    }
    setRejectedFiles((prev) => prev.filter((f) => f.id !== id));
    await loadRejectedCount();
    setToast({ message: 'تمت استعادة الملف ونشره', type: 'success' });
    setBusyId(null);
  }

  async function promote(id: string, toRole: 'admin' | 'trusted' | 'student') {
    const { error } = await supabase.from('profiles').update({ role: toRole }).eq('id', id);
    if (error) { setToast({ message: 'فشل: ' + error.message, type: 'error' }); return; }
    const labels: Record<string, string> = { admin: 'مدير', trusted: 'موثوق', student: 'طالب' };
    setToast({ message: `تم تحديث الدور إلى: ${labels[toRole]}`, type: 'success' });
    await loadUsers();
  }

  async function openPreview(file: FileRow) {
    setPreview(file);
    setSignedPreviewUrl(null);
    const url = await getSignedFileUrl(file.storage_path);
    setSignedPreviewUrl(url);
  }

  if (authLoading) {
    return <div className="py-20 text-center"><Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" /></div>;
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
        <p className="mt-1 text-slate-400">مراجعة الملفات، إدارة المواد، والصلاحيات.</p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs text-slate-400">قيد المراجعة</div>
          <div className="mt-1 text-2xl font-extrabold text-accent-400">{pending.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400">المواد</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-100">{subjects.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400">المستخدمون</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-100">{students.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400">موثوقون</div>
          <div className="mt-1 text-2xl font-extrabold text-brand-400">{students.filter((s) => s.role === 'trusted').length}</div>
        </div>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto border-b border-white/5">
        <button onClick={() => setTab('pending')} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${tab === 'pending' ? 'border-accent-500 text-accent-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          <Icon name="Clock" className="h-4 w-4" /> قيد المراجعة ({pending.length})
        </button>
        <button onClick={() => setTab('subjects')} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${tab === 'subjects' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          <Icon name="BookOpen" className="h-4 w-4" /> المواد ({subjects.length})
        </button>
        <button onClick={() => setTab('users')} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${tab === 'users' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          <Icon name="Users" className="h-4 w-4" /> المستخدمون
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center"><Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" /></div>
      ) : tab === 'pending' ? (
        <PendingTab pending={pending} approve={approve} reject={reject} preview={preview} setPreview={setPreview} openPreview={openPreview} busyId={busyId} rejectedCount={rejectedCount} rejectedFiles={rejectedFiles} restore={restore} />
      ) : tab === 'subjects' ? (
        <SubjectsTab subjects={subjects} setToast={setToast} onUpdated={loadSubjects} />
      ) : (
        <UsersTab students={students} promote={promote} />
      )}

      <Modal open={!!preview} onClose={() => { setPreview(null); setSignedPreviewUrl(null); }} title="معاينة الملف" maxWidth="max-w-3xl">
        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-ink-900 p-3">
              {signedPreviewUrl ? (
                isImageFile(preview.file_type) ? (
                  <img src={signedPreviewUrl} alt={preview.title} className="max-h-[60vh] mx-auto rounded-lg" />
                ) : isPdfFile(preview.file_type) ? (
                  <iframe src={signedPreviewUrl} title={preview.title} className="h-[60vh] w-full rounded-lg" />
                ) : (
                  <div className="py-12 text-center">
                    <Icon name="File" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
                    <p className="text-slate-400">لا تتوفر معاينة لهذا النوع. افتح الملف في نافذة جديدة.</p>
                    <a href={signedPreviewUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-4"><Icon name="Download" className="h-4 w-4" /> فتح الملف</a>
                  </div>
                )
              ) : (
                <div className="flex h-[40vh] items-center justify-center">
                  <Icon name="Loader2" className="h-8 w-8 animate-spin text-brand-400" />
                </div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-100">{preview.title}</h3>
              <p className="text-sm text-slate-400">{preview.uploader?.full_name} · {preview.subject?.name} {preview.subject?.code && <span className="font-mono text-slate-500">({preview.subject.code})</span>}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => reject(preview.id, preview.storage_path, preview.batch_id)} className="btn-danger" disabled={busyId === preview.id}>
                {busyId === preview.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />} رفض وحذف
              </button>
              <button onClick={() => approve(preview.id, preview.batch_id)} className="btn-primary" disabled={busyId === preview.id}>
                {busyId === preview.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Check" className="h-4 w-4" />} موافقة ونشر
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

type ToastState = { message: string; type: 'success' | 'error' } | null;
type SetToast = (t: ToastState) => void;

function PendingTab({ pending, approve, reject, preview, setPreview, openPreview, busyId, rejectedCount, rejectedFiles, restore }: {
  pending: FileRow[];
  approve: (id: string) => void;
  reject: (id: string, storagePath: string) => void;
  preview: FileRow | null;
  setPreview: (f: FileRow | null) => void;
  openPreview: (f: FileRow) => void;
  busyId: string | null;
  rejectedCount: number;
  rejectedFiles: FileRow[];
  restore: (id: string) => void;
}) {
  const [showRejected, setShowRejected] = useState(false);

  if (pending.length === 0 && !showRejected) {
    return (
      <div className="card p-12 text-center">
        <Icon name="Check" className="mx-auto mb-3 h-12 w-12 text-brand-500" />
        <p className="text-slate-300 font-bold">لا توجد ملفات بانتظار المراجعة</p>
        <p className="text-slate-500 text-sm mt-1">كل شيء تحت السيطرة!</p>
        {rejectedCount > 0 && (
          <button onClick={() => setShowRejected(true)} className="btn-ghost mt-4">
            <Icon name="BookX" className="h-4 w-4" /> عرض الملفات المرفوضة ({rejectedCount})
          </button>
        )}
      </div>
    );
  }

  if (showRejected) {
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Icon name="BookX" className="h-5 w-5 text-danger-400" /> الملفات المرفوضة ({rejectedFiles.length})
          </h2>
          <button onClick={() => setShowRejected(false)} className="btn-ghost">
            <Icon name="ArrowRight" className="h-4 w-4" /> عودة للمراجعة
          </button>
        </div>
        {rejectedFiles.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">لا توجد ملفات مرفوضة في هذه الصفحة.</div>
        ) : (
          rejectedFiles.map((f) => (
            <div key={f.id} className="card flex flex-col gap-3 p-4 opacity-70 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="badge bg-danger-500/15 text-danger-400 border border-danger-500/30">مرفوض</span>
                  <span className="text-xs text-slate-500">{f.subject?.name}</span>
                </div>
                <h3 className="mt-1.5 truncate font-bold text-slate-200">{f.title}</h3>
                <div className="mt-0.5 text-xs text-slate-500">{f.uploader?.full_name ?? 'مستخدم'}</div>
              </div>
              <button onClick={() => restore(f.id, f.batch_id)} className="btn-primary" disabled={busyId === f.id}>
                {busyId === f.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="RotateCcw" className="h-4 w-4" />} استعادة ونشر
              </button>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {pending.map((f) => (
        <div key={f.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="badge bg-ink-700 text-slate-300 border border-white/5">{TABS.find((t) => t.key === f.tab)?.label}</span>
              <span className="text-xs text-slate-500">{f.subject?.name} {f.subject?.code && <span className="font-mono text-slate-600">({f.subject.code})</span>}</span>
            </div>
            <h3 className="mt-1.5 truncate font-bold text-slate-100">{f.title}</h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <Icon name="GraduationCap" className="h-3.5 w-3.5" />{f.uploader?.full_name ?? 'مستخدم'}<span>·</span><span>{new Date(f.created_at).toLocaleDateString('ar')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openPreview(f)} className="btn-ghost" title="معاينة"><Icon name="Eye" className="h-4 w-4" /></button>
            <button onClick={() => approve(f.id, f.batch_id)} className="btn-primary" disabled={busyId === f.id}>
              {busyId === f.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Check" className="h-4 w-4" />} موافقة
            </button>
            <button onClick={() => reject(f.id, f.storage_path, f.batch_id)} className="btn-danger" disabled={busyId === f.id}>
              <Icon name="Trash2" className="h-4 w-4" /> رفض
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SubjectsTab({ subjects, setToast, onUpdated }: {
  subjects: Subject[];
  setToast: SetToast;
  onUpdated: () => Promise<void>;
}) {
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [deleteSubject, setDeleteSubject] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(subject: Subject) {
    setDeleting(true);
    const { data: files } = await supabase.from('files').select('storage_path').eq('subject_id', subject.id);
    if (files && files.length > 0) {
      const paths = files.map((f) => f.storage_path).filter(Boolean);
      if (paths.length > 0) await supabase.storage.from('files').remove(paths);
    }
    const { error } = await supabase.from('subjects').delete().eq('id', subject.id);
    setDeleting(false);
    setDeleteSubject(null);
    if (error) { setToast({ message: 'فشل حذف المادة: ' + error.message, type: 'error' }); return; }
    setToast({ message: `تم حذف المادة "${subject.name}" وكل ملفاتها`, type: 'success' });
    await onUpdated();
  }

  if (subjects.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Icon name="BookOpen" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
        <p className="text-slate-300 font-bold">لا توجد مواد بعد</p>
        <p className="text-slate-500 text-sm mt-1">يمكنك إضافة مواد من الصفحة الرئيسية.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {subjects.map((s) => {
        const depts = s.departments?.length ? s.departments : [s.major];
        return (
          <div key={s.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-bold text-slate-100">{s.name}</h3>
                {s.code && <span className="badge bg-ink-700 text-slate-400 border border-white/5 font-mono text-[10px]">{s.code}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {depts.map((d) => (
                  <span key={d} className="badge bg-ink-700 text-slate-400 border border-white/5 text-[10px]">{d}</span>
                ))}
              </div>
              {s.description && <p className="mt-1 text-sm text-slate-500 line-clamp-1">{s.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditSubject(s)} className="btn-ghost" title="تعديل">
                <Icon name="Pencil" className="h-4 w-4" /> تعديل
              </button>
              <button onClick={() => setDeleteSubject(s)} className="btn-danger" title="حذف">
                <Icon name="Trash2" className="h-4 w-4" /> حذف
              </button>
            </div>
          </div>
        );
      })}

      {editSubject && (
        <EditSubjectModal
          subject={editSubject}
          onClose={() => setEditSubject(null)}
          onSaved={() => { setEditSubject(null); onUpdated(); }}
          setToast={setToast}
        />
      )}

      {deleteSubject && (
        <Modal open={!!deleteSubject} onClose={() => setDeleteSubject(null)} title="تأكيد حذف المادة">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400">
              <Icon name="AlertCircle" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">سيتم حذف المادة نهائياً</p>
                <p className="mt-1 text-sm">سيُحذف "{deleteSubject.name}" وكل الملفات المرتبطة بها من قاعدة البيانات والتخزين. لا يمكن التراجع عن هذا الإجراء.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteSubject(null)} className="btn-ghost" disabled={deleting}>إلغاء</button>
              <button onClick={() => handleDelete(deleteSubject)} className="btn-danger" disabled={deleting}>
                {deleting ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />}
                حذف نهائي
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditSubjectModal({ subject, onClose, onSaved, setToast }: {
  subject: Subject;
  onClose: () => void;
  onSaved: () => void;
  setToast: SetToast;
}) {
  const [name, setName] = useState(subject.name);
  const [code, setCode] = useState(subject.code ?? '');
  const [description, setDescription] = useState(subject.description ?? '');
  const [major, setMajor] = useState(subject.major);
  const [departments, setDepartments] = useState<string[]>(subject.departments?.length ? subject.departments : [subject.major]);
  const [saving, setSaving] = useState(false);

  function toggleDept(d: string) {
    setDepartments((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const finalDepts = departments.length > 0 ? departments : [major];
    const { error } = await supabase
      .from('subjects')
      .update({ name: name.trim(), code: code.trim() || null, description: description.trim() || null, major, departments: finalDepts })
      .eq('id', subject.id);
    setSaving(false);
    if (error) { setToast({ message: 'فشل حفظ التعديلات: ' + error.message, type: 'error' }); return; }
    setToast({ message: 'تم تحديث المادة بنجاح', type: 'success' });
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`تعديل: ${subject.name}`}>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-300">اسم المادة</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">رمز المادة</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: CS101" className="input" dir="ltr" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">التخصص الأساسي</label>
            <select value={major} onChange={(e) => setMajor(e.target.value)} className="input">
              {MAJORS.map((m) => <option key={m} value={m} className="bg-ink-900">{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-300">الأقسام المشتركة</label>
          <div className="flex flex-wrap gap-2">
            {MAJORS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleDept(m)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  departments.includes(m)
                    ? 'bg-brand-500 text-ink-950'
                    : 'bg-ink-800 text-slate-300 border border-white/5 hover:bg-ink-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-300">الوصف</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input resize-none" placeholder="نبذة قصيرة..." />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">إلغاء</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Save" className="h-4 w-4" />} حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UsersTab({ students, promote }: {
  students: Profile[];
  promote: (id: string, toRole: 'admin' | 'trusted' | 'student') => void;
}) {
  if (students.length === 0) {
    return <div className="card p-12 text-center"><p className="text-slate-400">لا يوجد مستخدمون.</p></div>;
  }
  return (
    <div className="grid gap-3">
      {students.map((u) => (
        <div key={u.id} className="card flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-700 text-slate-300 font-bold">{(u.full_name ?? '؟').slice(0, 1)}</span>
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
                <>
                  <button onClick={() => promote(u.id, 'trusted')} className="btn-primary" title="ترقية إلى موثوق"><Icon name="Shield" className="h-4 w-4" /> موثوق</button>
                  <button onClick={() => promote(u.id, 'admin')} className="btn-ghost border border-accent-500/30 text-accent-400 hover:bg-accent-500/10" title="ترقية إلى مدير"><Icon name="ShieldCheck" className="h-4 w-4" /> مدير</button>
                </>
              ) : u.role === 'trusted' ? (
                <>
                  <button onClick={() => promote(u.id, 'admin')} className="btn-ghost border border-accent-500/30 text-accent-400 hover:bg-accent-500/10" title="ترقية إلى مدير"><Icon name="ShieldCheck" className="h-4 w-4" /> مدير</button>
                  <button onClick={() => promote(u.id, 'student')} className="btn-ghost" title="تخفيض إلى طالب"><Icon name="GraduationCap" className="h-4 w-4" /> طالب</button>
                </>
              ) : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    admin: { label: 'مدير', cls: 'bg-accent-500/20 text-accent-400 border-accent-500/40', icon: 'ShieldCheck' },
    trusted: { label: 'موثوق', cls: 'bg-brand-500/20 text-brand-300 border-brand-500/40', icon: 'Shield' },
    student: { label: 'طالب', cls: 'bg-ink-700 text-slate-300 border-white/10', icon: 'GraduationCap' },
  };
  const r = map[role] ?? map.student!;
  return (
    <span className={`badge border ${r.cls}`}>
      <Icon name={r.icon} className="h-3 w-3" />{r.label}
    </span>
  );
}

function isImageFile(type?: string | null) {
  return !!type && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(type.toLowerCase());
}
function isPdfFile(type?: string | null) {
  return !!type && type.toLowerCase() === 'pdf';
}
