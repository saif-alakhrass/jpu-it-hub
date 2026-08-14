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
  busyId: string | null;
}

const STATUS: Record<FileStatus, { label: string; className: string }> = {
  pending: { label: 'قيد المراجعة', className: 'border-accent-500/30 bg-accent-500/10 text-accent-300' },
  approved: { label: 'منشور', className: 'border-brand-500/30 bg-brand-500/10 text-brand-300' },
  rejected: { label: 'مرفوض', className: 'border-danger-500/30 bg-danger-500/10 text-danger-300' },
};

export function AdminFileLibrary({
  files, total, page, setPage, status, setStatus, selectedIds, toggleSelected,
  requestGroupSelected, openPreview, requestEdit, requestEditBatch, busyId,
}: AdminFileLibraryProps) {
  return (
    <div className="grid gap-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-100"><Icon name="FolderCog" className="h-5 w-5 text-brand-400" />مكتبة الملفات</h2>
          <p className="mt-1 text-sm text-slate-400">نظّم الملفات المنشورة والمعلّقة: الاسم، المكان، والمجلدات.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={status} onChange={(event) => { setPage(0); setStatus(event.target.value as FileStatus | 'all'); }} className="input min-h-0 w-auto py-2 text-sm">
            <option value="all">كل الحالات</option>
            <option value="approved">المنشورة</option>
            <option value="pending">قيد المراجعة</option>
            <option value="rejected">المرفوضة</option>
          </select>
          <button onClick={requestGroupSelected} className="btn-primary" disabled={selectedIds.size === 0}>
            <Icon name="FolderPlus" className="h-4 w-4" />تجميع المحدد ({selectedIds.size})
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">لا توجد ملفات بهذه الحالة.</div>
      ) : files.map((file) => {
        const state = STATUS[file.status];
        return (
          <div key={file.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <label className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-slate-400 ${file.batch_id ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-brand-400/50'}`} title={file.batch_id ? 'الملف موجود داخل مجلد بالفعل' : 'اختيار للتجميع'}>
              <input type="checkbox" checked={selectedIds.has(file.id)} onChange={() => toggleSelected(file.id)} disabled={!!file.batch_id} className="h-4 w-4 accent-brand-500" />
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge border ${state.className}`}>{state.label}</span>
                <span className="badge border border-white/5 bg-ink-700 text-slate-300">{TABS.find((item) => item.key === file.tab)?.label}</span>
                <span className="text-xs text-slate-500">{file.subject?.name}</span>
              </div>
              <h3 className="mt-1.5 truncate font-bold text-slate-100">{file.title}</h3>
              {file.batch && <p className="mt-1 text-xs text-accent-300"><Icon name="Folder" className="ml-1 inline h-3.5 w-3.5" />ضمن مجلد: {file.batch.box_name || file.batch.title}</p>}
              <p className="mt-1 text-xs text-slate-500">رفعه: {file.uploader?.full_name || 'رافع غير مسمّى'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => openPreview(file)} className="btn-ghost" title="معاينة"><Icon name="Eye" className="h-4 w-4" /></button>
              <button onClick={() => requestEdit(file)} className="btn-ghost" disabled={busyId === file.id}><Icon name="Pencil" className="h-4 w-4" />تعديل</button>
              {file.batch && <button onClick={() => requestEditBatch(file.batch!)} className="btn-ghost" disabled={busyId === file.batch?.id}><Icon name="FolderCog" className="h-4 w-4" />تعديل المجلد</button>}
            </div>
          </div>
        );
      })}
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
}
