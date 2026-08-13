import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Pagination } from '@/components/Pagination';
import { PAGE_SIZE } from '@/lib/constants';
import { TABS, type FileRow } from '@/lib/types';

interface AdminFileQueueProps {
  pending: FileRow[];
  pendingTotal: number;
  pendingPage: number;
  setPendingPage: (page: number) => void;
  approve: (id: string) => void;
  requestReject: (file: FileRow) => void;
  openPreview: (file: FileRow) => void;
  busyId: string | null;
  rejectedTotal: number;
  rejectedFiles: FileRow[];
  rejectedPage: number;
  setRejectedPage: (page: number) => void;
  restore: (id: string) => void;
  requestDeleteRejected: (file: FileRow) => void;
}

export function AdminFileQueue({
  pending, pendingTotal, pendingPage, setPendingPage,
  approve, requestReject, openPreview, busyId,
  rejectedTotal, rejectedFiles, rejectedPage, setRejectedPage, restore, requestDeleteRejected,
}: AdminFileQueueProps) {
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
            {rejectedFiles.map((file) => (
              <div key={file.id} className="card flex flex-col gap-3 p-4 opacity-70 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="badge bg-danger-500/15 text-danger-400 border border-danger-500/30">مرفوض</span>
                    <span className="text-xs text-slate-500">{file.subject?.name}</span>
                  </div>
                  <h3 className="mt-1.5 truncate font-bold text-slate-200">{file.title}</h3>
                  <div className="mt-0.5 text-xs text-slate-500">{file.uploader?.full_name ?? 'مستخدم'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => restore(file.id)} className="btn-primary" disabled={busyId === file.id}>
                    {busyId === file.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="RotateCcw" className="h-4 w-4" />} استعادة ونشر
                  </button>
                  <button onClick={() => requestDeleteRejected(file)} className="btn-danger" disabled={busyId === file.id}>
                    {busyId === file.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Trash2" className="h-4 w-4" />} حذف نهائي
                  </button>
                </div>
              </div>
            ))}
            <Pagination page={rejectedPage} totalPages={Math.max(1, Math.ceil(rejectedTotal / PAGE_SIZE))} onPageChange={setRejectedPage} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {pending.map((file) => (
        <div key={file.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="badge bg-ink-700 text-slate-300 border border-white/5">{TABS.find((tab) => tab.key === file.tab)?.label}</span>
              <span className="text-xs text-slate-500">{file.subject?.name} {file.subject?.code && <span className="font-mono text-slate-600">({file.subject.code})</span>}</span>
            </div>
            <h3 className="mt-1.5 truncate font-bold text-slate-100">{file.title}</h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              <Icon name="GraduationCap" className="h-3.5 w-3.5" />{file.uploader?.full_name ?? 'مستخدم'}<span>·</span><span>{new Date(file.created_at).toLocaleDateString('ar')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openPreview(file)} className="btn-ghost" title="معاينة"><Icon name="Eye" className="h-4 w-4" /></button>
            <button onClick={() => approve(file.id)} className="btn-primary" disabled={busyId === file.id}>
              {busyId === file.id ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Check" className="h-4 w-4" />} موافقة
            </button>
            <button onClick={() => requestReject(file)} className="btn-danger" disabled={busyId === file.id}>
              <Icon name="Trash2" className="h-4 w-4" /> رفض
            </button>
          </div>
        </div>
      ))}
      <Pagination page={pendingPage} totalPages={Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE))} onPageChange={setPendingPage} />
    </div>
  );
}
