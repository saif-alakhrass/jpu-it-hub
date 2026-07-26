import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Loader2 } from 'lucide-react';
import FileCard, { type MaterialFile } from './FileCard';

type MultiFileUploadProps = {
  subjectId: string;
  isAdmin: boolean;
  onUploaded?: () => void;
};

export default function MultiFileUpload({ subjectId, isAdmin, onUploaded }: MultiFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<MaterialFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setTotal(files.length);
    setDone(0);
    setUploading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    const uploaded: MaterialFile[] = [];

    for (const f of files) {
      const safeName = f.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_');
      const filePath = `${subjectId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('materials')
        .upload(filePath, f, { cacheControl: '3600', upsert: false });
      if (upErr) {
        setError(upErr.message);
        break;
      }

      const { data: row, error: dbErr } = await supabase
        .from('materials')
        .insert({
          subject_id: subjectId,
          file_path: filePath,
          file_name: f.name,
          uploaded_by: user?.id ?? null,
        })
        .select('id, file_path, file_name, subject_id, uploaded_by, created_at')
        .single();

      if (dbErr) {
        setError(dbErr.message);
        break;
      }
      if (row) uploaded.push(row as MaterialFile);
      setDone((d) => d + 1);
    }

    setUploading(false);
    if (uploaded.length > 0) {
      setRecent((prev) => [...uploaded, ...prev]);
      onUploaded?.();
    }
  }, [subjectId, onUploaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">رفع ملفات</h2>

      <div
        dir="rtl"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
        }`}
      >
        <Upload className="h-7 w-7 text-blue-600" />
        <p className="font-medium text-slate-700">اسحب الملفات هنا أو اضغط للاختيار</p>
        <p className="text-xs text-slate-400">يمكنك رفع عدة ملفات دفعة واحدة</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void uploadFiles(e.target.files)}
        />
      </div>

      {uploading && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ الرفع... ({done}/{total})
        </div>
      )}
      {error && <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {recent.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-medium text-slate-500">الملفات المرفوعة حديثًا</h3>
          {recent.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              isAdmin={isAdmin}
              onDeleted={(f) => setRecent((prev) => prev.filter((p) => p.id !== f.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
