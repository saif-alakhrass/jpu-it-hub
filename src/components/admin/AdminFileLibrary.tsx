import { useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Pagination } from '@/components/Pagination';
import { PAGE_SIZE } from '@/lib/constants';
import { TABS, type FileRow, type FileStatus } from '@/lib/types';

interface AdminFileLibraryProps {
  files: FileRow[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  status: FileStatus | 'all';
  setStatus: (status: FileStatus | 'all') => void;
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  requestGroupSelected: () => void;
  openPreview: (file: FileRow) => void;
  requestEdit: (file: FileRow) => void;
  requestEditBatch: (batch: NonNullable<FileRow['batch']>) => void;
  loadBatchFiles: (batchId: string) => Promise<FileRow[]>;
  busyId: string | null;
}

const STATUS: Record<FileStatus, { label: string; className: string }> = {
  pending: { label: 'قيد المراجعة', className: 'border-accent-500/30 bg-accent-500/10 text-accent-300' },
  approved: { label: 'منشور', className: 'border-brand-500/30 bg-brand-500/10 text-brand-300' },
  rejected: { label: 'مرفوض', className: 'border-danger-500/30 bg-danger-500/10 text-danger-300' },
};

type LibraryEntry =
  | { kind: 'folder'; id: string; folder: NonNullable<FileRow['batch']>; representative: FileRow }
  | { kind: 'file'; file: FileRow };

export function AdminFileLibrary({
  files, total, page, setPage, status, setStatus, selectedIds, toggleSelected,
  requestGroupSelected, openPreview, requestEdit, requestEditBatch, loadBatchFiles, busyId,
}: AdminFileLibraryProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderFiles, setFolderFiles] = useState<Record<string, FileRow[]>>({});
  const [loadingFolder, setLoadingFolder] = useState<string | null>(null);

  const entries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ar');
    const folderIds = new Set<string>();
    const result: LibraryEntry[] = [];
    for (const file of files) {
      const searchable = [file.title, file.subject?.name, file.subject?.code, file.uploader?.full_name, file.batch?.title, file.batch?.box_name]
        .filter(Boolean).join(' ').toLocaleLowerCase('ar');
      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
      if (file.batch) {
        if (!folderIds.has(file.batch.id)) {
          folderIds.add(file.batch.id);
          result.push({ kind: 'folder', id: file.batch.id, folder: file.batch, representative: file });
        }
      } else {
        result.push({ kind: 'file', file });
      }
    }
    return result.sort((a, b) => {
      const aTitle = a.kind === 'folder' ? (a.folder.box_name || a.folder.title) : a.file.title;
      const bTitle = b.kind === 'folder' ? (b.folder.box_name || b.folder.title) : b.file.title;
      return sort === 'title' ? aTitle.localeCompare(bTitle, 'ar') : 0;
    });
  }, [files, query, sort]);

  async function toggleFolder(batchId: string) {
    if (expandedFolders.has(batchId)) {
      setExpandedFolders((current) => { const next = new Set(current); next.delete(batchId); return next; });
      return;
    }
    setExpandedFolders((current) => new Set(current).add(batchId));
    if (folderFiles[batchId]) return;
    setLoadingFolder(batchId);
    try {
      const loadedFiles = await loadBatchFiles(batchId);
      setFolderFiles((current) => ({ ...current, [batchId]: loadedFiles }));
    } catch (err) {
      // The parent surfaces the toast; collapse again so the folder is not
      // shown as an empty one.
      console.error('Failed to load batch files', err);
      setExpandedFolders((current) => { const next = new Set(current); next.delete(batchId); return next; });
    } finally {
      setLoadingFolder(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-slate-100"><Icon name="FolderCog" className="h-5 w-5 text-brand-400" />مكتبة الملفات</h2>
            <p className="mt-1 text-sm text-slate-400">المجلدات مطوية افتراضيًا؛ افتح فقط ما تريد مراجعته.</p>
          </div>
          <button onClick={requestGroupSelected} className="btn-primary" disabled={selectedIds.size === 0}>
            <Icon name="FolderPlus" className="h-4 w-4" />تجميع المحدد ({selectedIds.size})
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative"><Icon name="Search" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-2 pr-9 text-sm" placeholder="ابحث بالاسم أو المادة أو الرافع أو المجلد..." /></div>
          <select value={status} onChange={(event) => { setPage(0); setStatus(event.target.value as FileStatus | 'all'); }} className="input min-h-0 py-2 text-sm">
            <option value="all">كل الحالات</option><option value="approved">المنشورة</option><option value="pending">قيد المراجعة</option><option value="rejected">المرفوضة</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'title')} className="input min-h-0 py-2 text-sm"><option value="recent">الأحدث أولًا</option><option value="title">الاسم أ–ي</option></select>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-slate-500"><span>{total} ملفًا ضمن النتيجة</span><span>{entries.filter((entry) => entry.kind === 'folder').length} مجلد ظاهر في هذه الصفحة</span></div>
      {entries.length === 0 ? <div className="card p-10 text-center text-slate-400">لا توجد ملفات مطابقة.</div> : entries.map((entry) => entry.kind === 'folder' ? (
        <FolderCard key={`folder-${entry.id}`} entry={entry} expanded={expandedFolders.has(entry.id)} files={folderFiles[entry.id]} loading={loadingFolder === entry.id} onToggle={() => void toggleFolder(entry.id)} openPreview={openPreview} requestEdit={requestEdit} requestEditBatch={requestEditBatch} busyId={busyId} />
      ) : (
        <FileCard key={entry.file.id} file={entry.file} selected={selectedIds.has(entry.file.id)} toggleSelected={toggleSelected} openPreview={openPreview} requestEdit={requestEdit} busyId={busyId} />
      ))}
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
}

function FolderCard({ entry, expanded, files, loading, onToggle, openPreview, requestEdit, requestEditBatch, busyId }: {
  entry: Extract<LibraryEntry, { kind: 'folder' }>;
  expanded: boolean; files?: FileRow[]; loading: boolean; onToggle: () => void;
  openPreview: (file: FileRow) => void; requestEdit: (file: FileRow) => void;
  requestEditBatch: (batch: NonNullable<FileRow['batch']>) => void; busyId: string | null;
}) {
  const { folder, representative } = entry;
  const state = STATUS[folder.status];
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900/50">
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-right transition hover:bg-white/[0.025]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-300"><Icon name="Folder" className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-100">{folder.box_name || folder.title}</h3><span className={`badge border ${state.className}`}>{state.label}</span></div>
        <p className="mt-1 text-xs text-slate-400">{folder.file_count} ملفات · {representative.subject?.name} · {TABS.find((item) => item.key === folder.tab)?.label}</p>
      </div>
      <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
    <div className="flex items-center justify-end gap-2 border-t border-white/5 px-4 py-2.5">
      <button onClick={(event) => { event.stopPropagation(); requestEditBatch(folder); }} className="btn-ghost text-xs" disabled={busyId === folder.id}><Icon name="FolderCog" className="h-4 w-4" />تعديل المجلد</button>
    </div>
    {expanded && <div className="border-t border-white/5 bg-ink-950/25 p-3">
      {loading ? <div className="flex items-center justify-center py-6"><Icon name="Loader2" className="h-5 w-5 animate-spin text-brand-400" /></div> : files?.length ? <div className="grid gap-2">{files.map((file) => <FileCard key={file.id} file={file} nested openPreview={openPreview} requestEdit={requestEdit} busyId={busyId} />)}</div> : <p className="py-4 text-center text-sm text-slate-500">لا توجد ملفات داخل هذا المجلد.</p>}
    </div>}
  </section>;
}

function FileCard({ file, selected = false, nested = false, toggleSelected, openPreview, requestEdit, busyId }: {
  file: FileRow; selected?: boolean; nested?: boolean; toggleSelected?: (id: string) => void;
  openPreview: (file: FileRow) => void; requestEdit: (file: FileRow) => void; busyId: string | null;
}) {
  const state = STATUS[file.status];
  return <div className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center ${nested ? 'border-white/5 bg-ink-900/70' : 'card'}`}>
    {toggleSelected ? <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-white/10 bg-ink-900 text-slate-400"><input type="checkbox" checked={selected} onChange={() => toggleSelected(file.id)} className="h-4 w-4 accent-brand-500" /></label> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-800 text-slate-500"><Icon name="File" className="h-4 w-4" /></span>}
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`badge border ${state.className}`}>{state.label}</span>{!nested && <span className="text-xs text-slate-500">{file.subject?.name}</span>}</div><h4 className="mt-1 truncate text-sm font-bold text-slate-200">{file.title}</h4><p className="mt-1 text-xs text-slate-500">رفعه: {file.uploader?.full_name || 'رافع غير مسمّى'}</p></div>
    <div className="flex items-center gap-2"><button onClick={() => openPreview(file)} className="btn-ghost" title="معاينة"><Icon name="Eye" className="h-4 w-4" /></button><button onClick={() => requestEdit(file)} className="btn-ghost text-xs" disabled={busyId === file.id}><Icon name="Pencil" className="h-4 w-4" />تعديل</button></div>
  </div>;
}
