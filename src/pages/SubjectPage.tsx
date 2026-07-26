import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { BookmarkEditor } from '@/components/BookmarkEditor';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { getCourseMeta } from '@/lib/courseDetails';
import { addBookmark, removeBookmark, getBookmarkedIds, getUserFolders } from '@/lib/bookmarks';
import { TABS, type Bookmark, type FileRow, type FileTab, type Subject } from '@/lib/types';
import { formatFileSize, getSignedFileUrl } from '@/lib/storage';
import { FileCardSkeletonList } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { MultiFileUpload } from '@/components/MultiFileUpload';

type DeleteTarget = { kind: 'file'; file: FileRow } | null;

export function SubjectPage() {
  const { session, profile, canPublishDirectly, isAdmin } = useAuth();
  const { navigate, route } = useRouter();
  const subjectId = route.params.id ?? '';
  const [subject, setSubject] = useState<Subject | null>(null);
  const [activeTab, setActiveTab] = useState<FileTab>('summaries');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; actionLabel?: string; onAction?: () => void } | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkForEditor, setBookmarkForEditor] = useState<{ bookmark: Bookmark; folders: string[] } | null>(null);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadSubject() {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code, description, major, departments, created_by, created_at')
      .eq('id', subjectId)
      .maybeSingle();
    if (error) console.error('[loadSubject] error:', error);
    setSubject(data as Subject | null);
  }

  async function loadFiles() {
    const { data, error } = await supabase
      .from('files')
      .select('id, subject_id, tab, title, storage_path, file_url, file_type, file_size, uploader_id, status, created_at, batch_id, uploader:profiles!files_uploader_id_fkey(id, full_name, role)')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[loadFiles] error:', error);
      setToast({ message: 'فشل تحميل الملفات: ' + error.message, type: 'error' });
    }
    setFiles((data ?? []) as unknown as FileRow[]);
  }

  // Optimistic: prepend newly uploaded files immediately so the user sees them
  // without waiting for a re-fetch. Falls back to a full reload on error.
  function handleFilesUploaded(newFiles: FileRow[]) {
    if (newFiles.length > 0) {
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.id));
        const fresh = newFiles.filter((f) => !existing.has(f.id));
        return [...fresh, ...prev];
      });
    }
    loadFiles();
  }

  useEffect(() => {
    if (files.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        files.map(async (f) => {
          const url = await getSignedFileUrl(f.storage_path);
          return [f.id, url] as const;
        }),
      );
      setSignedUrls(Object.fromEntries(entries.filter(([, u]) => u) as [string, string][]));
    })();
  }, [files]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadSubject(), loadFiles()]);
      setLoading(false);
    })();
  }, [subjectId]);

  useEffect(() => {
    if (!session || files.length === 0) return;
    (async () => {
      const ids = await getBookmarkedIds(files.map((f) => f.id));
      setBookmarkedIds(ids);
    })();
  }, [session, files]);

  // Render: simple filter by active tab only — no grouping, no batching.
  const tabFiles = files.filter((f) => f.tab === activeTab);
  const hasContent = tabFiles.length > 0;

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const file = deleteTarget.file;
    setBusyId(file.id);
    if (file.storage_path) {
      const { error: rmErr } = await supabase.storage.from('files').remove([file.storage_path]);
      if (rmErr) console.error('[delete] storage remove error:', rmErr);
    }
    const { error } = await supabase.from('files').delete().eq('id', file.id);
    setBusyId(null);
    setDeleteTarget(null);
    if (error) {
      console.error('[delete] db error:', error);
      setToast({ message: 'فشل حذف الملف: ' + error.message, type: 'error' });
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setToast({ message: `تم حذف الملف "${file.title}"`, type: 'success' });
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
        <p className="text-slate-400">المادة غير موجودة.</p>
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
            <p className="mt-1 text-slate-400">{getCourseMeta(subject.name, subject.description).description}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span>مستوى الصعوبة:</span>
              <DifficultyBadge difficulty={getCourseMeta(subject.name, subject.description).difficulty} />
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

      {!hasContent ? (
        <EmptyState
          icon="FolderOpen"
          title="لا توجد ملفات بعد"
          message={session ? "كن أول من يرفع ملفًا في هذا القسم!" : "سجل الدخول لتبدأ برفع الملفات."}
          ctaLabel={session ? "كن أول من يرفع!" : "تسجيل الدخول"}
          onCta={session ? () => setUploadOpen(true) : () => navigate('/auth')}
        />
      ) : (
        <div className="grid gap-3">
          {tabFiles.map((file) => (
            <FileRowCard
              key={file.id}
              file={file}
              profile={profile}
              isAdmin={isAdmin}
              bookmarkedIds={bookmarkedIds}
              signedUrls={signedUrls}
              busyId={busyId}
              onToggleBookmark={handleToggleBookmark}
              onDelete={() => setDeleteTarget({ kind: 'file', file })}
              bookmarkForEditor={bookmarkForEditor}
              setBookmarkForEditor={setBookmarkForEditor}
              setToast={setToast}
            />
          ))}
        </div>
      )}

      {session && profile && (
        <MultiFileUpload
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          subjectId={subjectId}
          activeTab={activeTab}
          userId={profile.id}
          uploaderName={profile.full_name ?? undefined}
          canPublishDirectly={canPublishDirectly}
          tabLabel={TABS.find((t) => t.key === activeTab)?.label ?? ''}
          onUploaded={handleFilesUploaded}
          onToast={setToast}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-danger-400">
              <Icon name="AlertCircle" className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">هل أنت متأكد من حذف هذا الملف؟</p>
                <p className="mt-1 text-sm">سيُحذف "{deleteTarget.file.title}" نهائياً ولا يمكن التراجع عن هذا الإجراء.</p>
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
  signedUrls: Record<string, string>;
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
  file, profile, isAdmin, bookmarkedIds, signedUrls, busyId, onToggleBookmark, onDelete, bookmarkForEditor, setBookmarkForEditor, setToast,
}: ProfileCardProps & { file: FileRow; onDelete: () => void }) {
  const isOwn = profile?.id === file.uploader_id;
  const pending = file.status === 'pending';
  return (
    <div className={`card flex items-center gap-4 p-4 transition hover:border-white/10 ${pending && !isOwn ? 'opacity-50' : ''}`}>
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
        signedUrls={signedUrls}
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

function FileActions({
  file, isOwn, pending, isAdmin, bookmarkedIds, signedUrls, busyId, onToggleBookmark, onDelete, bookmarkForEditor, setBookmarkForEditor, setToast,
}: CardProps & {
  file: FileRow;
  isOwn: boolean;
  pending: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="relative flex shrink-0 items-center gap-1">
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
      {!pending || isOwn ? (
        signedUrls[file.id] ? (
          <a href={signedUrls[file.id] ?? ''} target="_blank" rel="noreferrer" className="btn-ghost shrink-0" title="معاينة / تنزيل">
            <Icon name="Download" className="h-4 w-4" />
            <span className="hidden sm:inline">تنزيل</span>
          </a>
        ) : (
          <span className="badge bg-ink-700 text-slate-500 border border-white/5 shrink-0">
            <Icon name="Loader2" className="h-3 w-3 animate-spin" />
          </span>
        )
      ) : (
        <span className="badge bg-ink-700 text-slate-500 border border-white/5 shrink-0">
          <Icon name="Lock" className="h-3 w-3" /> مخفي
        </span>
      )}
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
