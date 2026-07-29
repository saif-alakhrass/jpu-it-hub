import { useState, useRef, useCallback } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { formatFileSize, getFileIcon, canUploadNow } from '@/lib/storage';
import { UPLOAD_MAX_PER_WINDOW, MAX_FILE_SIZE_MB } from '@/lib/constants';
import { useUpload, type QueuedFile } from '@/hooks/useUpload';
import type { FileTab } from '@/lib/types';

function buildBatchTitle(tabLabel: string, count: number): string {
  const d = new Date().toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${tabLabel} - مجموعة (${count} ملفات) - ${d}`;
}

interface MultiFileUploadProps {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  activeTab: FileTab;
  userId: string;
  canPublishDirectly: boolean;
  tabLabel: string;
  onUploaded: () => void;
  onToast: (t: { message: string; type: 'success' | 'error' }) => void;
}

export function MultiFileUpload({
  open,
  onClose,
  subjectId,
  activeTab,
  userId,
  canPublishDirectly,
  tabLabel,
  onUploaded,
  onToast,
}: MultiFileUploadProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [batchTitle, setBatchTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { uploading, uploadTimes, uploadBatch, validateQueue } = useUpload();

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newItems = validateQueue(fileList);
    setQueue((prev) => [...prev, ...newItems]);
  }, [validateQueue]);

  function removeFile(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function updateTitle(id: string, title: string) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, title } : q)));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = '';
  }

  function resetAndClose() {
    setQueue([]);
    setBatchTitle('');
    onClose();
  }

  const validQueue = queue.filter((q) => q.status !== 'error');
  const hasUploading = queue.some((q) => q.status === 'uploading');

  async function handleBatchUpload() {
    const toUpload = queue.filter((q) => q.status === 'waiting');
    if (toUpload.length === 0) return;

    if (!canUploadNow([...uploadTimes, ...Array(toUpload.length).fill(Date.now())])) {
      onToast({
        message: `لقد تجاوزت الحد المسموح: ${UPLOAD_MAX_PER_WINDOW} ملفات كل 10 دقائق. حاول لاحقًا.`,
        type: 'error',
      });
      return;
    }

    const result = await uploadBatch(
      toUpload,
      { subjectId, tab: activeTab, userId, canPublishDirectly, batchTitle, tabLabel },
      (item, status, error) => {
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status, error } : q)));
      },
    );

    if (result.successCount > 0) {
      onToast({
        message: canPublishDirectly ? `تم نشر ${result.successCount} ملف بنجاح` : `تم رفع ${result.successCount} ملف وهم قيد المراجعة`,
        type: 'success',
      });
      onUploaded();
    }
    if (result.failCount > 0 && result.successCount === 0) {
      onToast({ message: `فشل رفع ${result.failCount} ملف`, type: 'error' });
    }

    if (result.successCount > 0 && result.failCount === 0) {
      setTimeout(() => resetAndClose(), 800);
    }
  }

  const validWaiting = validQueue.filter((q) => q.status === 'waiting').length;
  const showBatchField = validWaiting > 1;

  const completedCount = queue.filter((q) => q.status === 'done').length;
  const errorCount = queue.filter((q) => q.status === 'error').length;
  const progress = queue.length > 0 ? Math.round((completedCount / queue.length) * 100) : 0;

  return (
    <Modal open={open} onClose={hasUploading ? () => {} : resetAndClose} title={`رفع ملفات - ${tabLabel}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {!canPublishDirectly && (
          <div className="flex items-start gap-2 rounded-xl border border-accent-500/30 bg-accent-500/10 p-3 text-sm text-accent-400">
            <Icon name="AlertCircle" className="h-5 w-5 shrink-0" />
            <span>ستحتاج ملفاتك إلى موافقة المدير قبل نشرها للجميع.</span>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-ink-900/40 hover:border-brand-500/50 hover:bg-ink-900/60'
          }`}
        >
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-400">
            <Icon name="Upload" className="h-7 w-7" />
          </div>
          <p className="font-bold text-slate-200">اسحب الملفات هنا أو انقر للاختيار</p>
          <p className="mt-1 text-xs text-slate-500">
            الحد الأقصى {MAX_FILE_SIZE_MB} ميجابايت لكل ملف · PDF, DOC, PPT, PNG, JPG
          </p>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileInput} className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg" />
        </div>

        {showBatchField && (
          <div className="rounded-xl border border-white/10 bg-ink-900/40 p-3">
            <label className="mb-1.5 block text-xs font-bold text-slate-400">عنوان المجموعة (اختياري)</label>
            <input
              value={batchTitle}
              onChange={(e) => setBatchTitle(e.target.value)}
              placeholder={buildBatchTitle(tabLabel, validWaiting)}
              className="input-sm"
              disabled={uploading}
            />
            <p className="mt-1.5 text-xs text-slate-500">سيتم تجميع {validWaiting} ملفات في مجموعة واحدة قابلة للفتح والتنزيل.</p>
          </div>
        )}

        {queue.length > 0 && (
          <div className="space-y-2">
            {uploading && (
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                  <span>التقدم: {completedCount} / {queue.length - errorCount}</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {queue.map((q) => (
              <div key={q.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                q.status === 'done' ? 'border-success-500/30 bg-success-500/5' :
                q.status === 'error' ? 'border-danger-500/30 bg-danger-500/5' :
                q.status === 'uploading' ? 'border-brand-500/40 bg-brand-500/5' :
                'border-white/5 bg-ink-900/40'
              }`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-700 text-brand-400">
                  <Icon name={getFileIcon(q.file.name.split('.').pop() ?? '')} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  {q.status === 'waiting' ? (
                    <input value={q.title} onChange={(e) => updateTitle(q.id, e.target.value)} placeholder="عنوان الملف..." className="input-sm" disabled={uploading} />
                  ) : (
                    <p className="truncate text-sm font-bold text-slate-200">{q.title || q.file.name}</p>
                  )}
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span>{formatFileSize(q.file.size)}</span>
                    <span>·</span>
                    <span className="uppercase">{q.file.name.split('.').pop()}</span>
                    {q.status === 'uploading' && <span className="flex items-center gap-1 text-brand-400"><Icon name="Loader2" className="h-3 w-3 animate-spin" /> جارٍ الرفع...</span>}
                    {q.status === 'done' && <span className="flex items-center gap-1 text-success-400"><Icon name="Check" className="h-3 w-3" /> تم</span>}
                    {q.status === 'error' && <span className="flex items-center gap-1 text-danger-400"><Icon name="AlertCircle" className="h-3 w-3" /> {q.error}</span>}
                  </div>
                </div>
                {(q.status === 'waiting' || q.status === 'error') && !uploading && (
                  <button onClick={() => removeFile(q.id)} className="rounded-lg p-2 text-slate-500 transition hover:bg-danger-500/10 hover:text-danger-400" title="إزالة">
                    <Icon name="X" className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-xs text-slate-500">{validWaiting} ملف جاهز للرفع{showBatchField ? ' · مجموعة' : ''}</div>
          <div className="flex gap-2">
            <button type="button" onClick={hasUploading ? () => {} : resetAndClose} disabled={hasUploading} className="btn-ghost disabled:opacity-40">
              {hasUploading ? 'جارٍ الرفع...' : 'إلغاء'}
            </button>
            <button type="button" onClick={handleBatchUpload} disabled={uploading || validQueue.filter((q) => q.status === 'waiting').length === 0} className="btn-primary disabled:opacity-40">
              {uploading ? <><Icon name="Loader2" className="h-4 w-4 animate-spin" /> جارٍ الرفع...</> : <><Icon name="Upload" className="h-4 w-4" /> رفع {validQueue.filter((q) => q.status === 'waiting').length} ملف</>}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
