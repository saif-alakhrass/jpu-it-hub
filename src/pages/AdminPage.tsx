import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/context/AuthContext';
import { TABS, type FileRow, type Profile, type Subject, type Role, type Difficulty } from '@/lib/types';
import { MAJORS } from '@/lib/types';
import { getSignedFileUrl } from '@/lib/storage';
import {
  fetchPendingFilesPaged,
  fetchRejectedFilesPaged,
  fetchAdminStats,
  setFileStatus,
  setBatchStatus,
  type AdminStats,
} from '@/services/files';
import { fetchAllSubjects, deleteSubject as deleteSubjectSvc, updateSubject } from '@/services/subjects';
import { fetchProfiles, updateUserRole } from '@/services/auth';
import { useCountUp } from '@/components/Reveal';
import { Reveal } from '@/components/Reveal';

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
    Promise.all([loadPending(), loadRejected(), loadSubjects(), loadUsers(), loadStats()]).finally(() => setLoading(false));
  }, [isAdmin, loadPending, loadRejected, loadSubjects, loadUsers, loadStats]);

  async function handleApprove(id: string, batchId?: string | null) {
    setBusyId(id);
    const ok = await setFileStatus(id, 'approved');
    if (!ok) { setToast({ message: 'فشل الموافقة على الملف', type: 'error' }); setBusyId(null); return; }
    if (batchId) await setBatchStatus(batchId, 'approved');
    setPending((prev) => prev.filter((f) => f.id !== id));
    await loadStats();
    setToast({ message: 'تمت الموافقة على الملف ونشره', type: 'success' });
    setPreview(null);
    setSignedPreviewUrl(null);
    setBusyId(null);
  }

  async function performReject(file: FileRow) {
    setBusyId(file.id);
    const ok = await setFileStatus(file.id, 'rejected');
    if (!ok) { setToast({ message: 'فشل رفض الملف', type: 'error' }); setBusyId(null); return; }
    if (file.batch_id) await setBatchStatus(file.batch_id, 'rejected');
    setPending((prev) => prev.filter((f) => f.id !== file.id));
    await loadStats();
    await loadRejected();
    setToast({ message: 'تم رفض الملف ويمكن استعادته لاحقاً', type: 'success' });
    setPreview(null);
    setSignedPreviewUrl(null);
    setConfirmReject(null);
    setBusyId(null);
  }

  async function handleRestore(id: string, batchId?: string | null) {
    setBusyId(id);
    const ok = await setFileStatus(id, 'approved');
    if (!ok) { setToast({ message: 'فشل استعادة الملف', type: 'error' }); setBusyId(null); return; }
    if (batchId) await setBatchStatus(batchId, 'approved');
    setRejectedFiles((prev) => prev.filter((f) => f.id !== id));
    await loadStats();
    setToast({ message: 'تمت استعادة الملف ونشره', type: 'success' });
    setBusyId(null);
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
        <OverviewTab stats={stats} pendingCount={pendingTotal} />
      ) : tab === 'pending' ? (
        <PendingTab
          pending={pending}
          pendingTotal={pendingTotal}
          pendingPage={pendingPage}
          setPendingPage={setPendingPage}
          approve={handleApprove}
          requestReject={(f) => setConfirmReject(f)}
          openPreview={openPreview}
          busyId={busyId}
          rejectedTotal={rejectedTotal}
          rejectedFiles={rejectedFiles}
          rejectedPage={rejectedPage}
          setRejectedPage={setRejectedPage}
          restore={handleRestore}
        />
      ) : tab === 'subjects' ? (
        <SubjectsTab subjects={subjects} setToast={setToast} onUpdated={loadSubjects} />
      ) : (
        <UsersTab students={students} requestRoleChange={(user, toRole) => setConfirmRole({ user, toRole })} busyId={busyId} />
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
              <button onClick={() => setConfirmReject(preview)} className="btn-danger" disabled={busyId === preview.id}>
                {busyId === preview.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />} رفض وحذف
              </button>
              <button onClick={() => handleApprove(preview.id, preview.batch_id)} className="btn-primary" disabled={busyId === preview.id}>
                {busyId === preview.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Check" className="h-4 w-4" />} موافقة ونشر
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!confirmReject} onClose={() => setConfirmReject(null)} title="تأكيد رفض الملف">
        {confirmReject && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400">
              <Icon name="FileWarning" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">سيتم رفض الملف وإخفاؤه</p>
                <p className="mt-1 text-sm">سيبقى "{confirmReject.title}" محفوظاً ليتمكن المدير من مراجعته أو استعادته لاحقاً.</p>
              </div>
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

function StatTile({ icon, value, label, color, delay }: { icon: string; value: number; label: string; color: string; delay: number }) {
  const { ref, value: v } = useCountUp(value);
  return (
    <Reveal delay={delay} className="card group relative overflow-hidden p-6">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/10" />
      <div className="relative flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${color}`}>
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div>
          <div className="text-2xl font-extrabold text-slate-100">
            <span ref={ref}>{v.toLocaleString('en-US')}</span>
          </div>
          <div className="text-sm text-slate-400">{label}</div>
        </div>
      </div>
    </Reveal>
  );
}

function OverviewTab({ stats, pendingCount }: { stats: AdminStats | null; pendingCount: number }) {
  if (!stats) {
    return <div className="card p-12 text-center"><Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" /></div>;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile icon="FileText" value={stats.totalFiles} label="إجمالي الملفات" color="bg-brand-500/15 text-brand-400" delay={0} />
        <StatTile icon="Clock" value={pendingCount} label="قيد المراجعة" color="bg-accent-500/15 text-accent-400" delay={80} />
        <StatTile icon="Users" value={stats.totalUsers} label="المستخدمون" color="bg-ink-700 text-slate-300" delay={160} />
        <StatTile icon="BookOpen" value={stats.totalSubjects} label="المواد" color="bg-brand-500/15 text-brand-400" delay={240} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile icon="Check" value={stats.approvedFiles} label="ملفات منشورة" color="bg-success-500/15 text-success-400" delay={0} />
        <StatTile icon="FileWarning" value={stats.rejectedFiles} label="ملفات مرفوضة" color="bg-danger-500/15 text-danger-400" delay={80} />
        <StatTile icon="Shield" value={stats.trustedUsers} label="مستخدمون موثوقون" color="bg-brand-500/15 text-brand-400" delay={160} />
        <StatTile icon="ShieldCheck" value={stats.admins} label="المديرون" color="bg-accent-500/15 text-accent-400" delay={240} />
      </div>

      <Reveal delay={200}>
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-100">
            <Icon name="BarChart3" className="h-5 w-5 text-brand-400" />
            توزيع الملفات حسب الحالة
          </h3>
          <div className="space-y-3">
            <ProgressBar label="منشورة" value={stats.approvedFiles} total={stats.totalFiles} color="bg-success-500" />
            <ProgressBar label="قيد المراجعة" value={stats.pendingFiles} total={stats.totalFiles} color="bg-accent-500" />
            <ProgressBar label="مرفوضة" value={stats.rejectedFiles} total={stats.totalFiles} color="bg-danger-500" />
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function ProgressBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">{value} ({pct}%)</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PendingTab({
  pending, pendingTotal, pendingPage, setPendingPage,
  approve, requestReject, openPreview, busyId,
  rejectedTotal, rejectedFiles, rejectedPage, setRejectedPage, restore,
}: {
  pending: FileRow[];
  pendingTotal: number;
  pendingPage: number;
  setPendingPage: (p: number) => void;
  approve: (id: string, batchId?: string | null) => void;
  requestReject: (f: FileRow) => void;
  openPreview: (f: FileRow) => void;
  busyId: string | null;
  rejectedTotal: number;
  rejectedFiles: FileRow[];
  rejectedPage: number;
  setRejectedPage: (p: number) => void;
  restore: (id: string, batchId?: string | null) => void;
}) {
  const [showRejected, setShowRejected] = useState(false);

  if (pending.length === 0 && !showRejected) {
    return (
      <div className="card p-12 text-center">
        <Icon name="Check" className="mx-auto mb-3 h-12 w-12 text-brand-500" />
        <p className="text-slate-300 font-bold">لا توجد ملفات بانتظار المراجعة</p>
        <p className="text-slate-500 text-sm mt-1">كل شيء تحت السيطرة!</p>
        {rejectedTotal > 0 && (
          <button onClick={() => setShowRejected(true)} className="btn-ghost mt-4">
            <Icon name="BookX" className="h-4 w-4" /> عرض الملفات المرفوضة ({rejectedTotal})
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
            <Icon name="BookX" className="h-5 w-5 text-danger-400" /> الملفات المرفوضة ({rejectedTotal})
          </h2>
          <button onClick={() => setShowRejected(false)} className="btn-ghost">
            <Icon name="ArrowRight" className="h-4 w-4" /> عودة للمراجعة
          </button>
        </div>
        {rejectedFiles.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">لا توجد ملفات مرفوضة في هذه الصفحة.</div>
        ) : (
          <>
            {rejectedFiles.map((f) => (
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
            ))}
            <Pagination page={rejectedPage} totalPages={Math.max(1, Math.ceil(rejectedTotal / 20))} onPageChange={setRejectedPage} />
          </>
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
            <button onClick={() => requestReject(f)} className="btn-danger" disabled={busyId === f.id}>
              <Icon name="Trash2" className="h-4 w-4" /> رفض
            </button>
          </div>
        </div>
      ))}
      <Pagination page={pendingPage} totalPages={Math.max(1, Math.ceil(pendingTotal / 20))} onPageChange={setPendingPage} />
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
    const ok = await deleteSubjectSvc(subject.id);
    setDeleting(false);
    setDeleteSubject(null);
    if (!ok) { setToast({ message: 'فشل حذف المادة', type: 'error' }); return; }
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

function UsersTab({ students, requestRoleChange, busyId }: {
  students: Profile[];
  requestRoleChange: (user: Profile, toRole: Role) => void;
  busyId: string | null;
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
                  <button onClick={() => requestRoleChange(u, 'trusted')} className="btn-primary" title="ترقية إلى موثوق" disabled={busyId === u.id}><Icon name="Shield" className="h-4 w-4" /> موثوق</button>
                  <button onClick={() => requestRoleChange(u, 'admin')} className="btn-ghost border border-accent-500/30 text-accent-400 hover:bg-accent-500/10" title="ترقية إلى مدير" disabled={busyId === u.id}><Icon name="ShieldCheck" className="h-4 w-4" /> مدير</button>
                </>
              ) : u.role === 'trusted' ? (
                <>
                  <button onClick={() => requestRoleChange(u, 'admin')} className="btn-ghost border border-accent-500/30 text-accent-400 hover:bg-accent-500/10" title="ترقية إلى مدير" disabled={busyId === u.id}><Icon name="ShieldCheck" className="h-4 w-4" /> مدير</button>
                  <button onClick={() => requestRoleChange(u, 'student')} className="btn-ghost" title="تخفيض إلى طالب" disabled={busyId === u.id}><Icon name="GraduationCap" className="h-4 w-4" /> طالب</button>
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
