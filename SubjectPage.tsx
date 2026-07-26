import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import FileCard, { type MaterialFile } from './FileCard';
import MultiFileUpload from './MultiFileUpload';

type SubjectPageProps = {
  subjectId: string;
  subjectName?: string;
};

export default function SubjectPage({ subjectId, subjectName }: SubjectPageProps) {
  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setIsAdmin(false); return; }
      const { data, error: err } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (active) setIsAdmin(!err && data?.role === 'admin');
    })();
    return () => { active = false; };
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('materials')
      .select('id, file_path, file_name, subject_id, uploaded_by, created_at')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    setFiles((data as MaterialFile[]) ?? []);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  return (
    <div dir="rtl" className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{subjectName ?? 'المواد'}</h1>
        <p className="mt-1 text-slate-500">الملفات المرتبطة بهذه المادة</p>
      </header>

      <MultiFileUpload subjectId={subjectId} isAdmin={isAdmin} onUploaded={loadFiles} />

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">الملفات</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 p-3 text-red-600">{error}</div>
        ) : files.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-slate-400">
            لا توجد ملفات بعد.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {files.map((file) => (
              <li key={file.id}>
                <FileCard
                  file={file}
                  isAdmin={isAdmin}
                  onDeleted={(f) => setFiles((prev) => prev.filter((p) => p.id !== f.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
