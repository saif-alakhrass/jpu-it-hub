import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { BookmarkEditor } from '@/components/BookmarkEditor';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/lib/router';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { getCourseMeta } from '@/lib/courseDetails';
import { addBookmark, removeBookmark, getUserFolders } from '@/services/bookmarks';
import { getBookmarkedIds } from '@/services/bookmarks';
import { TABS, type Bookmark, type FileBatch, type FileRow, type FileTab, type Subject, type Difficulty } from '@/lib/types';
import { formatFileSize } from '@/lib/storage';
import { FileCardSkeletonList } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { MultiFileUpload } from '@/components/MultiFileUpload';
import { fetchSubject } from '@/services/subjects';
import {
  fetchFilesForSubject,
  fetchBatchesForSubject,
  deleteFile,
  deleteBatch,
  removeStorageObjects,
} from '@/services/files';
import { supabase } from '@/lib/supabase';
import { getUserErrorMessage } from '@/lib/serviceError';
import { smartMatch } from '@/lib/arabicSearch';
import { useSignedFileAccess } from '@/hooks/useSignedFileAccess';

type DeleteTarget =
  | { kind: 'file'; file: FileRow; batchId?: string | null }
  | { kind: 'batch'; batch: FileBatch }
  | null;

interface DisplayGroup {
  key: string;
  batch: FileBatch | null;
  files: FileRow[];
}

export function SubjectPage() {
  const { session, profile, canPublishDirectly, isAdmin } = useAuth();
  const { navigate, route } = useRouter();
  const subjectId = route.params.id ?? '';
  const [subject, setSubject] = useState<Subject | null>(null);
  const [activeTab, setActiveTab] = useState<FileTab>('summaries');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [batches, setBatches] = useState<FileBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; actionLabel?: string; onAction?: () => void } | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkForEditor, setBookmarkForEditor] = useState<{ bookmark: Bookmark; folders: string[] } | null>(null);

  const reportFileAccessError = useCallback((message: string) => {
    setToast({ message, type: 'error' });
  }, []);
  const { accessingFileId, accessFile } = useSignedFileAccess(reportFileAccessError);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const loadSubject = useCallback(async () => {
    const data = await fetchSubject(subjectId);
    setSubject(data);
  }, [subjectId]);

  const loadFiles = useCallback(async () => {
    const [f, b] = await Promise.all([
      fetchFilesForSubject(subjectId),
      fetchBatchesForSubject(subjectId),
    ]);
    setFiles(f);
    setBatches(b);
  }, [subjectId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([loadSubject(), loadFiles()]);
    } catch (error) {
      setLoadError(getUserErrorMessage(error, 'تعذر تحميل المادة وملفاتها.'));
    } finally {
      setLoading(false);
    }
  }, [loadFiles, loadSubject]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!session || files.length === 0) return;
    (async () => {
      const ids = await getBookmarkedIds(files.map((f) => f.id));
      setBookmarkedIds(ids);
    })();
  }, [session, files]);

  // Build display groups: batches first (with their files), then standalone files.
  // Files whose batch is invisible (hidden by RLS) fall back to standalone cards.
  const groups: DisplayGroup[] = useMemo(() => {
    const tabFiles = files.filter((f) => f.tab === activeTab);
    const tabBatches = batches.filter((b) => b.tab === activeTab);
    const result: DisplayGroup[] = [];
    for (const batch of tabBatches) {
      const batchFiles = tabFiles.filter((f) => f.batch_id === batch.id);
      if (batchFiles.length > 0) {
        result.push({ key: `batch-${batch.id}`, batch, files: batchFiles });
      }
    }
    const visibleBatchIds = new Set(tabBatches.map((b) => b.id));
    const standalone = tabFiles.filter((f) => !f.batch_id || !visibleBatchIds.has(f.batch_id));
    for (const f of standalone) {
      result.push({ key: `file-${f.id}`, batch: null, files: [f] });
    }
    return result;
  }, [files, batches, activeTab]);

  const hasContent = groups.length > 0;

  const filteredGroups: DisplayGroup[] = useMemo(() => {
    if (!deferredSearchQuery.trim()) return groups;
    const q = deferredSearchQuery.trim();
    const result: DisplayGroup[] = [];
    for (const group of groups) {
      if (group.batch) {
        const batchMatches = smartMatch(group.batch.title, q);
        const matchingFiles = group.files.filter((f) => smartMatch(f.title, q));
        if (batchMatches) {
          result.push({ ...group, files: group.files });
        } else if (matchingFiles.length > 0) {
          result.push({ ...group, files: matchingFiles });
        }
      } else {
        if (group.files.some((f) => smartMatch(f.title, q))) {
          result.push(group);
        }
      }
    }
    return result;
  }, [groups, deferredSearchQuery]);

  const hasSearchResults = filteredGroups.length > 0;

  useEffect(() => {
    if (!deferredSearchQuery.trim()) return;
    const q = deferredSearchQuery.trim();
    const toExpand = new Set<string>();
    for (const group of groups) {
      if (group.batch && !smartMatch(group.batch.title, q)) {
        if (group.files.some((f) => smartMatch(f.title, q))) {
          toExpand.add(group.batch.id);
        }
      }
    }
    if (toExpand.size > 0) {
      setExpandedBatches((prev) => new Set([...prev, ...toExpand]));
    }
  }, [groups, deferredSearchQuery]);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'file') {
      const file = deleteTarget.file;
      setBusyId(file.id);
      const ok = await deleteFile(file.id);
      if (!ok) {
        setBusyId(null);
        setDeleteTarget(null);
        setToast({ message: 'فشل حذف الملف', type: 'error' });
        return;
      }
      const storageOk = file.storage_path ? await removeStorageObjects([file.storage_path]) : true;
      setBusyId(null);
      setDeleteTarget(null);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (deleteTarget.batchId) {
        const remaining = files.filter((f) => f.batch_id === deleteTarget.batchId && f.id !== file.id);
        if (remaining.length === 0) {
          await deleteBatch(deleteTarget.batchId);
          setBatches((prev) => prev.filter((b) => b.id !== deleteTarget.batchId));
        } else {
          setBatches((prev) =>
            prev
              .map((b) => (b.id === deleteTarget.batchId ? { ...b, file_count: Math.max(0, b.file_count - 1) } : b))
              .filter((b) => b.file_count > 0),
          );
        }
      }
      setToast({
        message: storageOk
          ? `تم حذف الملف "${file.title}" نهائياً`
          : `تم حذف سجل "${file.title}"، لكن ملف التخزين يحتاج تنظيفًا يدويًا`,
        type: storageOk ? 'success' : 'error',
      });
      return;
    }
    // batch hard delete: storage objects → child file rows → batch row
    const batch = deleteTarget.batch;
    setBusyId(batch.id);
    const batchFiles = files.filter((f) => f.batch_id === batch.id);
    const paths = batchFiles.map((f) => f.storage_path).filter(Boolean);
    const { error: filesErr } = await supabase.from('files').delete().eq('batch_id', batch.id);
    if (filesErr) {
      setBusyId(null);
      setDeleteTarget(null);
      setToast({ message: 'فشل حذف سجلات الملفات: ' + filesErr.message, type: 'error' });
      return;
    }
    const storageOk = paths.length === 0 || await removeStorageObjects(paths);
    const batchOk = await deleteBatch(batch.id);
    setBusyId(null);
    setDeleteTarget(null);
    if (!batchOk) {
      setToast({ message: 'فشل حذف المجموعة', type: 'error' });
      return;
    }
    setFiles((prev) => prev.filter((f) => f.batch_id !== batch.id));
    setBatches((prev) => prev.filter((b) => b.id !== batch.id));
    setToast({
      message: storageOk
        ? `تم حذف المجموعة "${batch.title}" وكل ملفاتها نهائياً`
        : `تم حذف المجموعة "${batch.title}"، لكن بعض ملفات التخزين تحتاج تنظيفًا يدويًا`,
      type: storageOk ? 'success' : 'error',
    });
  }

  async function handleToggleBookmark(file: FileRow) {
    if (!session) {
      navigate('/auth');
      return;
    }
    if (bookmarkedIds.has(file.id)) {
      const ok = await removeBookmark(file.id);
      if (ok) setBookmarkedIds((prev) => { const n = new Set(prev); n.delete(file.id); return n; });
      return;
    }
    const folderName = subject?.name ?? 'عام';
    const created = await addBookmark(file.id, folderName);
    if (created) {
      setBookmarkedIds((prev) => new Set(prev).add(file.id));
      const folders = await getUserFolders();
      setToast({
        message: `تم الحفظ في مجلد ${folderName}`,
        type: 'success',
        actionLabel: 'تغيير المجلد / أضف ملاحظة',
        onAction: () => setBookmarkForEditor({ bookmark: created, folders }),
      });
    } else {
      setToast({ message: 'فشل حفظ العنصر', type: 'error' });
    }
  }

  function toggleBatch(id: string) {
    setExpandedBatches((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="card mb-6 h-32 animate-pulse" />
        <div className="mb-6 h-12 w-full animate-pulse rounded-lg bg-ink-700/40" />
        <FileCardSkeletonList count={4} />
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <Icon name="AlertCircle" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
        <p className="text-slate-400">{loadError ?? 'المادة غير موجودة.'}</p>
        {loadError && (
          <button onClick={() => void loadPage()} className="btn-primary mt-4">
            <Icon name="RefreshCw" className="h-4 w-4" /> إعادة المحاولة
          </button>
        )}
        <button onClick={() => navigate('/')} className="btn-ghost mt-4">
          <Icon name="Home" className="h-4 w-4" /> العودة للرئيسية
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <button onClick={() => navigate('/')} className="mb-5 flex items-center gap-1 text-sm text-slate-400 hover:text-brand-300 transition">
        <Icon name="ChevronLeft" className="h-4 w-4" />
        العودة للمواد
      </button>

      <header className="card mb-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(subject.departments?.length ? subject.departments : [subject.major]).map((d) => (
                <span key={d} className="badge bg-ink-700 text-slate-300 border border-white/5">{d}</span>
              ))}
              {(subject.departments?.length ?? 0) > 1 && (
                <span className="badge bg-brand-500/15 text-brand-300 border border-brand-500/30">
                  <Icon name="Layers" className="h-3 w-3" />
                  مشترك بين التخصصات
                </span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-slate-100 md:text-3xl">{subject.name}</h1>
            {subject.code && <span className="mt-1 inline-block font-mono text-sm text-brand-400">{subject.code}</span>}
            <p className="mt-1 text-slate-400">{subject.course_description ?? subject.description ?? getCourseMeta(subject.name, subject.description).description}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span>مستوى الصعوبة:</span>
              <DifficultyBadge difficulty={(subject.difficulty ?? getCourseMeta(subject.name, subject.description).difficulty) as Difficulty} />
            </div>
          </div>
          <button onClick={() => session ? setUploadOpen(true) : navigate('/auth')} className="btn-primary shrink-0">
            <Icon name="Upload" className="h-4 w-4" />
            رفع ملف
          </button>
        </div>
      </header>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-white/5 pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-t-xl border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === t.key
                ? 'border-brand-500 text-brand-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {hasContent && (
        <div className="relative mb-5 max-w-md">
          <Icon name="Search" className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في الملفات والمجموعات..."
            className="input pr-11"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              aria-label="مسح البحث"
            >
              <Icon name="X" className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!hasContent ? (
        <EmptyState
          icon="FolderOpen"
          title="لا توجد ملفات بعد"
          message={session ? "كن أول من يرفع ملفًا في هذا القسم!" : "سجل الدخول لتبدأ برفع الملفات."}
          ctaLabel={session ? "كن أول من يرفع!" : "تسجيل الدخول"}
          onCta={session ? () => setUploadOpen(true) : () => navigate('/auth')}
        />
      ) : !hasSearchResults && deferredSearchQuery.trim() ? (
        <EmptyState
          icon="SearchX"
          title="لا توجد نتائج تطابق بحثك"
          message="لم نجد ملفات أو مجموعات تطابق بحثك. جرب كلمات أخرى أو امسح البحث."
          ctaLabel="مسح البحث"
          onCta={() => setSearchQuery('')}
        />
      ) : (
        <div className="grid gap-3">
          {filteredGroups.map((group) => {
            const batch = group.batch;
            const standalone = group.files[0] ?? null;
            return batch ? (
              <BatchFolderCard
                key={group.key}
                batch={batch}
                files={group.files}
                expanded={expandedBatches.has(batch.id)}
                onToggle={() => toggleBatch(batch.id)}
                profile={profile}
                isAdmin={isAdmin}
                bookmarkedIds={bookmarkedIds}
                accessingFileId={accessingFileId}
                onPreview={(file) => void accessFile(file, 'preview')}
                onDownload={(file) => void accessFile(file, 'download')}
                busyId={busyId}
                onToggleBookmark={handleToggleBookmark}
                onDeleteFile={(file) => setDeleteTarget({ kind: 'file', file, batchId: batch.id })}
                onDeleteBatch={() => setDeleteTarget({ kind: 'batch', batch })}
                bookmarkForEditor={bookmarkForEditor}
                setBookmarkForEditor={setBookmarkForEditor}
                setToast={setToast}
              />
            ) : standalone ? (
              <FileRowCard
                key={group.key}
                file={standalone}
                profile={profile}
                isAdmin={isAdmin}
                bookmarkedIds={bookmarkedIds}
                accessingFileId={accessingFileId}
                onPreview={(file) => void accessFile(file, 'preview')}
                onDownload={(file) => void accessFile(file, 'download')}
                busyId={busyId}
                onToggleBookmark={handleToggleBookmark}
                onDelete={() => setDeleteTarget({ kind: 'file', file: standalone, batchId: null })}
                bookmarkForEditor={bookmarkForEditor}
                setBookmarkForEditor={setBookmarkForEditor}
                setToast={setToast}
              />
            ) : null;
          })}
        </div>
      )}

      {session && profile && (
        <MultiFileUpload
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          subjectId={subjectId}
          activeTab={activeTab}
          userId={profile.id}
          canPublishDirectly={canPublishDirectly}
          tabLabel={TABS.find((t) => t.key === activeTab)?.label ?? ''}
          onUploaded={loadFiles}
          onToast={setToast}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400">
              <Icon name="AlertCircle" className="h-5 w-5 shrink-0" />
              <div>
                {deleteTarget.kind === 'batch' ? (
                  <>
                    <p className="font-bold">هل أنت متأكد من حذف هذه المجموعة؟</p>
                    <p className="mt-1 text-sm">سيُحذف "{deleteTarget.batch.title}" وكل ملفاتها ({deleteTarget.batch.file_count} ملف) نهائياً ولا يمكن التراجع.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold">هل أنت متأكد من حذف هذا الملف؟</p>
                    <p className="mt-1 text-sm">سيُحذف "{deleteTarget.file.title}" نهائياً ولا يمكن التراجع عن هذا الإجراء.</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-ghost" disabled={!!busyId}>إلغاء</button>
              <button onClick={handleConfirmDelete} className="btn-danger" disabled={!!busyId}>
                {busyId ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />}
                حذف
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

interface CardProps {
  isAdmin: boolean;
  bookmarkedIds: Set<string>;
  accessingFileId: string | null;
  onPreview: (file: FileRow) => void;
  onDownload: (file: FileRow) => void;
  busyId: string | null;
  onToggleBookmark: (f: FileRow) => void;
  bookmarkForEditor: { bookmark: Bookmark; folders: string[] } | null;
  setBookmarkForEditor: (v: { bookmark: Bookmark; folders: string[] } | null) => void;
  setToast: (t: { message: string; type: 'success' | 'error' }) => void;
}

interface ProfileCardProps extends CardProps {
  profile: { id: string } | null;
}

function FileRowCard({
  file, profile, isAdmin, bookmarkedIds, accessingFileId, onPreview, onDownload, busyId, onToggleBookmark, onDelete, bookmarkForEditor, setBookmarkForEditor, setToast,
}: ProfileCardProps & { file: FileRow; onDelete: () => void }) {
  const isOwn = profile?.id === file.uploader_id;
  const pending = file.status === 'pending';
  return (
    <div className={`card flex min-w-0 flex-wrap items-center gap-3 p-4 transition hover:border-white/10 sm:flex-nowrap sm:gap-4 ${pending && !isOwn ? 'opacity-50' : ''}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-700 text-brand-400">
        <Icon name="File" className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-bold text-slate-100">{file.title}</h3>
          {pending && (
            <span className="badge bg-accent-500/15 text-accent-400 border border-accent-500/30">
              <Icon name="Clock" className="h-3 w-3" />
              قيد المراجعة
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
          <span>{file.uploader?.full_name ?? 'مستخدم'}</span>
          <span>·</span>
          <span>{new Date(file.created_at).toLocaleDateString('ar')}</span>
          {file.file_type && <span>·<span className="uppercase"> {file.file_type}</span></span>}
          {file.file_size != null && <span>· {formatFileSize(file.file_size)}</span>}
        </div>
      </div>
      <FileActions
        file={file}
        isOwn={isOwn}
        pending={pending}
        isAdmin={isAdmin}
        bookmarkedIds={bookmarkedIds}
        accessingFileId={accessingFileId}
        onPreview={onPreview}
        onDownload={onDownload}
        busyId={busyId}
        onToggleBookmark={onToggleBookmark}
        onDelete={onDelete}
        bookmarkForEditor={bookmarkForEditor}
        setBookmarkForEditor={setBookmarkForEditor}
        setToast={setToast}
      />
    </div>
  );
}

function BatchFolderCard({
  batch, files, expanded, onToggle, profile, isAdmin, bookmarkedIds, accessingFileId, onPreview, onDownload, busyId, onToggleBookmark, onDeleteFile, onDeleteBatch, bookmarkForEditor, setBookmarkForEditor, setToast,
}: ProfileCardProps & {
  batch: FileBatch;
  files: FileRow[];
  expanded: boolean;
  onToggle: () => void;
  onDeleteFile: (f: FileRow) => void;
  onDeleteBatch: () => void;
}) {
  const isOwn = profile?.id === batch.uploader_id;
  const pending = batch.status === 'pending';
  const totalSize = files.reduce((sum, f) => sum + (f.file_size ?? 0), 0);
  return (
    <div className={`card min-w-0 overflow-hidden transition ${pending && !isOwn ? 'opacity-60' : ''}`}>
      <div className="flex min-w-0 items-center gap-3 p-4 sm:gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
          <Icon name="FolderOpen" className="h-5 w-5" />
        </span>
        <button onClick={onToggle} className="min-w-0 flex-1 text-right">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-slate-100">{batch.title}</h3>
            {pending && (
              <span className="badge bg-accent-500/15 text-accent-400 border border-accent-500/30">
                <Icon name="Clock" className="h-3 w-3" />
                قيد المراجعة
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
            <span>{files[0]?.uploader?.full_name ?? 'مستخدم'}</span>
            <span>·</span>
            <span>{files.length} ملف</span>
            <span>·</span>
            <span>{formatFileSize(totalSize)}</span>
            <span>·</span>
            <span>{new Date(batch.created_at).toLocaleDateString('ar')}</span>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggle}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            title={expanded ? 'طي' : 'فتح'}
          >
            <Icon name={expanded ? 'ChevronDown' : 'ChevronLeft'} className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button
              onClick={onDeleteBatch}
              className="rounded-lg p-2 text-danger-400 transition hover:bg-danger-500/10"
              title="حذف المجموعة"
              disabled={busyId === batch.id}
            >
              {busyId === batch.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-white/5 bg-ink-900/30 p-3">
          <div className="grid gap-2">
            {files.map((f) => {
              const fOwn = profile?.id === f.uploader_id;
              const fPending = f.status === 'pending';
              return (
                <div key={f.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg bg-ink-800/40 p-3 sm:flex-nowrap">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-700 text-brand-400">
                    <Icon name="File" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-bold text-slate-100">{f.title}</h4>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {f.file_type && <span className="uppercase">{f.file_type}</span>}
                      {f.file_size != null && <span>· {formatFileSize(f.file_size)}</span>}
                    </div>
                  </div>
                  <FileActions
                    file={f}
                    isOwn={fOwn}
                    pending={fPending}
                    isAdmin={isAdmin}
                    bookmarkedIds={bookmarkedIds}
                    accessingFileId={accessingFileId}
                    onPreview={onPreview}
                    onDownload={onDownload}
                    busyId={busyId}
                    onToggleBookmark={onToggleBookmark}
                    onDelete={() => onDeleteFile(f)}
                    bookmarkForEditor={bookmarkForEditor}
                    setBookmarkForEditor={setBookmarkForEditor}
                    setToast={setToast}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FileActions({
  file, isAdmin, bookmarkedIds, accessingFileId, onPreview, onDownload, busyId, onToggleBookmark, onDelete, bookmarkForEditor, setBookmarkForEditor, setToast,
}: CardProps & {
  file: FileRow;
  isOwn: boolean;
  pending: boolean;
  onDelete: () => void;
}) {
  const accessing = accessingFileId === file.id;
  return (
    <div className="relative flex w-full shrink-0 items-center justify-end gap-1 border-t border-white/5 pt-2 sm:w-auto sm:border-0 sm:pt-0">
      <button
        onClick={() => onToggleBookmark(file)}
        className={`rounded-lg p-2 transition ${
          bookmarkedIds.has(file.id)
            ? 'text-brand-400 hover:bg-brand-500/10'
            : 'text-slate-500 hover:text-brand-300 hover:bg-white/5'
        }`}
        title={bookmarkedIds.has(file.id) ? 'إزالة من المحفوظات' : 'حفظ في المحفوظات'}
      >
        <Icon name={bookmarkedIds.has(file.id) ? 'BookmarkCheck' : 'Bookmark'} className="h-4 w-4" />
      </button>
      {bookmarkForEditor?.bookmark.resource_id === file.id && (
        <BookmarkEditor
          bookmark={bookmarkForEditor.bookmark}
          existingFolders={bookmarkForEditor.folders}
          onClose={() => setBookmarkForEditor(null)}
          onSaved={() => setToast({ message: 'تم تحديث المحفوظ', type: 'success' })}
        />
      )}
      <button
        onClick={() => onPreview(file)}
        className="btn-ghost shrink-0"
        title="عرض"
        disabled={accessing}
      >
        <Icon name={accessing ? 'Loader2' : 'ExternalLink'} className={`h-4 w-4 ${accessing ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">عرض</span>
      </button>
      <button
        onClick={() => onDownload(file)}
        className="btn-ghost shrink-0"
        title="تنزيل"
        disabled={accessing}
      >
        <Icon name={accessing ? 'Loader2' : 'Download'} className={`h-4 w-4 ${accessing ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">تنزيل</span>
      </button>
      {isAdmin && (
        <button
          onClick={onDelete}
          className="rounded-lg p-2 text-danger-400 transition hover:bg-danger-500/10"
          title="حذف الملف"
          disabled={busyId === file.id}
        >
          {busyId === file.id ? (
            <Icon name="Loader2" className="h-4 w-4 animate-spin" />
          ) : (
            <Icon name="Trash2" className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
