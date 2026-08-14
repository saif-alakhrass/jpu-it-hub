import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { useAuth } from '@/hooks/useAuth';
import { type FileRow, type Profile, type Subject, type Role, type Difficulty, type FileTab, TABS } from '@/lib/types';
import { MAJORS } from '@/lib/types';
import { getSignedFileUrl } from '@/lib/storage';
import { deleteFileViaWorker, isR2Configured, requestDownloadPresign } from '@/lib/r2Client';
import { supabase } from '@/lib/supabase';
import {
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  fetchAdminStats,
  deleteFile,
  removeStorageObjects,
  setFileStatus,
  updatePendingFile,
  type AdminStats,
} from '@/services/files';
import { fetchAllSubjects, deleteSubject as deleteSubjectSvc, updateSubject } from '@/services/subjects';
import { fetchProfiles, updateUserRole } from '@/services/auth';
import { getUserErrorMessage } from '@/lib/serviceError';
import { AdminOverview } from '@/components/admin/AdminOverview';
import { AdminFileQueue } from '@/components/admin/AdminFileQueue';
import { AdminUsers } from '@/components/admin/AdminUsers';

type AdminTab = 'overview' | 'pending' | 'subjects' | 'users';

export function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [pending, setPending] = useState<FileRow[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(0);
  const [rejectedFiles, setRejectedFiles] = useState<FileRow[]>([]);
  const [rejectedTotal, setRejectedTotal] = useState(0);
  const [rejectedPage, setRejectedPage] = useState(0);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<FileRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editPending, setEditPending] = useState<FileRow | null>(null);
  const [confirmDeleteRejected, setConfirmDeleteRejected] = useState<FileRow | null>(null);
  const [confirmRole, setConfirmRole] = useState<{ user: Profile; toRole: Role } | null>(null);

  const loadPending = useCallback(async () => {
    const result = await fetchPendingFilesPaged(pendingPage);
    setPending(result.items);
    setPendingTotal(result.total);
  }, [pendingPage]);

  const loadRejected = useCallback(async () => {
    const result = await fetchRejectedFilesPaged(rejectedPage);
    setRejectedFiles(result.items);
    setRejectedTotal(result.total);
  }, [rejectedPage]);

  const loadSubjects = useCallback(async () => {
    setSubjects(await fetchAllSubjects());
  }, []);

  const loadUsers = useCallback(async () => {
    setStudents(await fetchProfiles());
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await fetchAdminStats());
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    Promise.all([loadPending(), loadRejected(), loadSubjects(), loadUsers(), loadStats()])
      .catch((error) => setToast({
        message: getUserErrorMessage(error, 'تعذر تحميل بيانات لوحة الإدارة.'),
        type: 'error',
      }))
      .finally(() => setLoading(false));
  }, [isAdmin, loadPending, loadRejected, loadSubjects, loadUsers, loadStats]);

  async function handleApprove(id: string) {
    setBusyId(id);
    const ok = await setFileStatus(id, 'approved');
    if (!ok) { setToast({ message: 'فشل الموافقة على الملف', type: 'error' }); setBusyId(null); return; }
    setPending((prev) => prev.filter((f) => f.id !== id));
    await loadStats();
    setToast({ message: 'تمت الموافقة على الملف ونشره', type: 'success' });
    setPreview(null);
    setSignedPreviewUrl(null);
    setBusyId(null);
  }

  async function performReject(file: FileRow) {
    const reason = rejectionReason.trim();
    if (reason.length < 3) { setToast({ message: 'اكتب سبب الرفض بثلاثة أحرف على الأقل', type: 'error' }); return; }
    setBusyId(file.id);
    const ok = await setFileStatus(file.id, 'rejected', reason);
    if (!ok) { setToast({ message: 'فشل رفض الملف', type: 'error' }); setBusyId(null); return; }
    setPending((prev) => prev.filter((f) => f.id !== file.id));
    await loadStats();
    await loadRejected();
    setToast({ message: 'تم رفض الملف ويمكن استعادته لاحقاً', type: 'success' });
    setPreview(null);
    setSignedPreviewUrl(null);
    setConfirmReject(null);
    setRejectionReason('');
    setBusyId(null);
  }

  async function handleEditPending(file: FileRow, changes: { title: string; subject_id: string; tab: FileTab }) {
    setBusyId(file.id);
    const ok = await updatePendingFile(file.id, changes);
    setBusyId(null);
    if (!ok) { setToast({ message: 'فشل حفظ تعديل الملف', type: 'error' }); return; }
    setEditPending(null);
    await loadPending();
    setToast({ message: 'تم تعديل اسم الملف أو مكانه، ووصل إشعار للرافع', type: 'success' });
  }

  async function handleRestore(id: string) {
    setBusyId(id);
    const ok = await setFileStatus(id, 'approved');
    if (!ok) { setToast({ message: 'فشل استعادة الملف', type: 'error' }); setBusyId(null); return; }
    setRejectedFiles((prev) => prev.filter((f) => f.id !== id));
    await loadStats();
    setToast({ message: 'تمت استعادة الملف ونشره', type: 'success' });
    setBusyId(null);
  }

  async function performDeleteRejected(file: FileRow) {
    setBusyId(file.id);
    try {
      if (file.storage_provider === 'r2' && file.object_key && isR2Configured()) {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error('Missing authenticated session');

        const result = await deleteFileViaWorker(accessToken, file.id);
        if (!result) throw new Error('Worker delete request failed');

        if (!result.success) {
          await loadRejected();
          await loadStats();
          setConfirmDeleteRejected(null);
          setToast({
            message: result.cleanup_queued
              ? 'تم حذف سجل الملف، لكن تعذر حذف النسخة المخزنة. أُضيفت عملية تنظيف لإعادة المحاولة.'
              : 'تعذر حذف الملف نهائيًا.',
            type: 'error',
          });
          return;
        }
      } else {
        const storageDeleted = file.storage_path
          ? await removeStorageObjects([file.storage_path])
          : true;
        if (!storageDeleted) throw new Error('Legacy storage delete failed');

        const recordDeleted = await deleteFile(file.id);
        if (!recordDeleted) throw new Error('Database record delete failed');
      }

      setRejectedFiles((files) => files.filter((item) => item.id !== file.id));
      setRejectedTotal((total) => Math.max(0, total - 1));
      setConfirmDeleteRejected(null);
      await loadStats();
      setToast({ message: 'تم حذف الملف المرفوض نهائيًا من التخزين والسجل.', type: 'success' });
    } catch {
      setToast({ message: 'تعذر حذف الملف نهائيًا. لم يُزل من القائمة.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function performRoleChange(user: Profile, toRole: Role) {
    setBusyId(user.id);
    const ok = await updateUserRole(user.id, toRole);
    setBusyId(null);
    setConfirmRole(null);
    if (!ok) { setToast({ message: 'فشل تحديث الدور', type: 'error' }); return; }
    const labels: Record<Role, string> = { admin: 'مدير', trusted: 'موثوق', student: 'طالب' };
    setToast({ message: `تم تحديث دور ${user.full_name ?? 'المستخدم'} إلى: ${labels[toRole]}`, type: 'success' });
    await loadUsers();
    await loadStats();
  }

  async function openPreview(file: FileRow) {
    setPreview(file);
    setSignedPreviewUrl(null);
    try {
      let url: string | null = null;
      if (file.storage_provider === 'r2' && file.object_key && isR2Configured()) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const result = await requestDownloadPresign(token, file.id);
          if (result?.download_url) url = result.download_url;
          else if (result?.provider === 'supabase' && result.storage_path) url = await getSignedFileUrl(result.storage_path);
        }
      } else {
        url = await getSignedFileUrl(file.storage_path);
      }
      if (!url) throw new Error('preview URL unavailable');
      setSignedPreviewUrl(url);
    } catch {
      setPreview(null);
      setToast({ message: 'تعذر إنشاء رابط معاينة آمن للملف.', type: 'error' });
    }
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

      <div className="mb-5 flex gap-2 overflow-x-auto border-b border-white/5">
        <button onClick={() => setTab('overview')} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${tab === 'overview' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          <Icon name="BarChart3" className="h-4 w-4" /> نظرة عامة
        </button>
        <button onClick={() => setTab('pending')} className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition ${tab === 'pending' ? 'border-accent-500 text-accent-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
          <Icon name="Clock" className="h-4 w-4" /> قيد المراجعة ({pendingTotal})
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
      ) : tab === 'overview' ? (
        <AdminOverview stats={stats} pendingCount={pendingTotal} />
      ) : tab === 'pending' ? (
        <AdminFileQueue
          pending={pending}
          pendingTotal={pendingTotal}
          pendingPage={pendingPage}
          setPendingPage={setPendingPage}
          approve={handleApprove}
          requestReject={(f) => { setRejectionReason(''); setConfirmReject(f); }}
          requestEdit={setEditPending}
          openPreview={openPreview}
          busyId={busyId}
          rejectedTotal={rejectedTotal}
          rejectedFiles={rejectedFiles}
          rejectedPage={rejectedPage}
          setRejectedPage={setRejectedPage}
          restore={handleRestore}
          requestDeleteRejected={setConfirmDeleteRejected}
        />
      ) : tab === 'subjects' ? (
        <SubjectsTab subjects={subjects} setToast={setToast} onUpdated={loadSubjects} />
      ) : (
        <AdminUsers users={students} requestRoleChange={(user, toRole) => setConfirmRole({ user, toRole })} busyId={busyId} />
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
              <button onClick={() => { setRejectionReason(''); setConfirmReject(preview); }} className="btn-danger" disabled={busyId === preview.id}>
                {busyId === preview.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />} رفض وحذف
              </button>
              <button onClick={() => handleApprove(preview.id)} className="btn-primary" disabled={busyId === preview.id}>
                {busyId === preview.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Check" className="h-4 w-4" />} موافقة ونشر
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirmReject} onClose={() => { setConfirmReject(null); setRejectionReason(''); }} title="رفض الملف وإرسال السبب">
        {confirmReject && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400">
              <Icon name="FileWarning" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">سيتم رفض الملف وإخفاؤه</p>
                <p className="mt-1 text-sm">سيبقى "{confirmReject.title}" محفوظاً ليتمكن المدير من مراجعته أو استعادته لاحقاً.</p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-300">سبب الرفض</label>
              <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="input min-h-24 resize-y" maxLength={500} placeholder="مثال: الملف ليس ملخصًا للمادة، يرجى رفعه في قسم السلايدات." autoFocus />
              <p className="mt-1 text-xs text-slate-500">سيظهر السبب للرافع فقط داخل إشعاراته.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmReject(null)} className="btn-ghost" disabled={busyId === confirmReject.id}>إلغاء</button>
              <button onClick={() => performReject(confirmReject)} className="btn-danger" disabled={busyId === confirmReject.id}>
                {busyId === confirmReject.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />}
                تأكيد الرفض
              </button>
            </div>
          </div>
        )}
      </Modal>

      {editPending && <EditPendingFileModal file={editPending} subjects={subjects} saving={busyId === editPending.id} onClose={() => setEditPending(null)} onSave={(changes) => void handleEditPending(editPending, changes)} />}

      <Modal open={!!confirmDeleteRejected} onClose={() => setConfirmDeleteRejected(null)} title="حذف ملف مرفوض نهائيًا">
        {confirmDeleteRejected && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400">
              <Icon name="Trash2" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">هذا الإجراء لا يمكن التراجع عنه</p>
                <p className="mt-1 text-sm">سيُحذف &quot;{confirmDeleteRejected.title}&quot; من التخزين ومن قاعدة البيانات نهائيًا.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmDeleteRejected(null)} className="btn-ghost" disabled={busyId === confirmDeleteRejected.id}>إلغاء</button>
              <button onClick={() => performDeleteRejected(confirmDeleteRejected)} className="btn-danger" disabled={busyId === confirmDeleteRejected.id}>
                {busyId === confirmDeleteRejected.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />}
                حذف نهائي
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirmRole} onClose={() => setConfirmRole(null)} title="تأكيد تغيير الدور">
        {confirmRole && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-accent-500/30 bg-accent-500/10 p-4 text-accent-400">
              <Icon name="ShieldCheck" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">تأكيد تغيير الدور</p>
                <p className="mt-1 text-sm">سيتم تغيير دور "{confirmRole.user.full_name ?? 'المستخدم'}" إلى "{ROLE_LABELS_AR[confirmRole.toRole]}".</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmRole(null)} className="btn-ghost" disabled={busyId === confirmRole.user.id}>إلغاء</button>
              <button onClick={() => performRoleChange(confirmRole.user, confirmRole.toRole)} className="btn-primary" disabled={busyId === confirmRole.user.id}>
                {busyId === confirmRole.user.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="ShieldCheck" className="h-4 w-4" />}
                تأكيد
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

const ROLE_LABELS_AR: Record<Role, string> = { admin: 'مدير', trusted: 'موثوق', student: 'طالب' };

type ToastState = { message: string; type: 'success' | 'error' } | null;
type SetToast = (t: ToastState) => void;

function EditPendingFileModal({ file, subjects, saving, onClose, onSave }: {
  file: FileRow;
  subjects: Subject[];
  saving: boolean;
  onClose: () => void;
  onSave: (changes: { title: string; subject_id: string; tab: FileTab }) => void;
}) {
  const [title, setTitle] = useState(file.title);
  const [subjectId, setSubjectId] = useState(file.subject_id);
  const [tab, setTab] = useState<FileTab>(file.tab);
  const changesLocation = subjectId !== file.subject_id || tab !== file.tab;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length >= 2) onSave({ title: trimmedTitle, subject_id: subjectId, tab });
  }

  return <Modal open onClose={onClose} title="تنظيم الملف قبل المراجعة">
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-6 text-slate-400">يمكنك تصحيح الاسم أو نقل الملف للقسم والمادة المناسبين بدل رفضه. سيصل للرافع إشعار بالتعديل.</p>
      <div><label className="mb-1.5 block text-sm font-bold text-slate-300">اسم الملف الظاهر</label><input value={title} onChange={(event) => setTitle(event.target.value)} className="input" minLength={2} maxLength={180} required autoFocus /></div>
      <div><label className="mb-1.5 block text-sm font-bold text-slate-300">المادة</label><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="input" required>{subjects.map((subject) => <option className="bg-ink-900" key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select></div>
      <div><label className="mb-1.5 block text-sm font-bold text-slate-300">القسم</label><select value={tab} onChange={(event) => setTab(event.target.value as FileTab)} className="input">{TABS.map((option) => <option className="bg-ink-900" key={option.key} value={option.key}>{option.label}</option>)}</select></div>
      {changesLocation && file.batch_id && <p className="rounded-xl border border-accent-500/25 bg-accent-500/10 px-3 py-2 text-xs leading-5 text-accent-300">نقل هذا الملف سيخرجه من مجموعته الحالية حتى لا تصبح المجموعة موزعة بين مواد أو أقسام مختلفة.</p>}
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="btn-ghost" disabled={saving}>إلغاء</button><button type="submit" className="btn-primary" disabled={saving || title.trim().length < 2}>{saving ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Save" className="h-4 w-4" />} حفظ التعديل</button></div>
    </form>
  </Modal>;
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
    const result = await deleteSubjectSvc(subject.id);
    setDeleting(false);
    setDeleteSubject(null);
    if (!result.ok) { setToast({ message: 'فشل حذف المادة', type: 'error' }); return; }
    setToast({
      message: result.storageCleanupFailed
        ? `تم حذف المادة "${subject.name}"، لكن بعض ملفات التخزين تحتاج تنظيفًا يدويًا`
        : `تم حذف المادة "${subject.name}" وكل ملفاتها`,
      type: result.storageCleanupFailed ? 'error' : 'success',
    });
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
  const [courseDescription, setCourseDescription] = useState(subject.course_description ?? '');
  const [major, setMajor] = useState(subject.major);
  const [departments, setDepartments] = useState<string[]>(subject.departments?.length ? subject.departments : [subject.major]);
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(subject.difficulty ?? '');
  const [saving, setSaving] = useState(false);

  function toggleDept(d: string) {
    setDepartments((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const finalDepts = departments.length > 0 ? departments : [major];
    const ok = await updateSubject(subject.id, {
      name: name.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      course_description: courseDescription.trim() || null,
      major,
      departments: finalDepts,
      difficulty: (difficulty || null) as Difficulty | null,
    });
    setSaving(false);
    if (!ok) { setToast({ message: 'فشل حفظ التعديلات', type: 'error' }); return; }
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
          <label className="mb-1.5 block text-sm font-bold text-slate-300">مستوى الصعوبة</label>
          <div className="flex flex-wrap gap-2">
            {(['سهلة', 'متوسطة', 'صعبة'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(difficulty === d ? '' : d)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  difficulty === d
                    ? 'bg-brand-500 text-ink-950'
                    : 'bg-ink-800 text-slate-300 border border-white/5 hover:bg-ink-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-300">الوصف القصير</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input resize-none" placeholder="نبذة قصيرة..." />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-300">وصف المادة التفصيلي</label>
          <textarea value={courseDescription} onChange={(e) => setCourseDescription(e.target.value)} rows={3} className="input resize-none" placeholder="وصف تفصيلي للمادة ومحتوياتها..." />
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

function isImageFile(type?: string | null) {
  return !!type && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(type.toLowerCase());
}
function isPdfFile(type?: string | null) {
  return !!type && type.toLowerCase() === 'pdf';
}
