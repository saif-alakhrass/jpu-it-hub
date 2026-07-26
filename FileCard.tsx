import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Eye, Download, Trash2, FileText, Loader2 } from 'lucide-react';

export type MaterialFile = {
  id: string;
  file_path: string;
  file_name: string;
  subject_id?: string;
  uploaded_by?: string | null;
  created_at?: string;
};

type FileCardProps = {
  file: MaterialFile;
  isAdmin: boolean;
  onDeleted?: (file: MaterialFile) => void;
};

export default function FileCard({ file, isAdmin, onDeleted }: FileCardProps) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleView = () => {
    const { data } = supabase.storage.from('materials').getPublicUrl(file.file_path);
    window.open(data.publicUrl, '_blank');
  };

  const handleDownload = async () => {
    setDownloading(true);
    const { data, error } = await supabase.storage.from('materials').download(file.file_path);
    setDownloading(false);
    if (error || !data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف "${file.file_name}"؟`)) return;
    setDeleting(true);
    await supabase.storage.from('materials').remove([file.file_path]);
    await supabase.from('materials').delete().eq('id', file.id);
    setDeleting(false);
    onDeleted?.(file);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{file.file_name}</p>
          {file.created_at && (
            <p className="text-xs text-slate-400">
              {new Date(file.created_at).toLocaleDateString('ar-EG')}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleView}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          title="عرض"
        >
          <Eye className="h-4 w-4" />
          عرض
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          title="تنزيل"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          تنزيل
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            title="حذف"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            حذف
          </button>
        )}
      </div>
    </div>
  );
}
