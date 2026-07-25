import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { getCourseMeta } from '@/lib/courseDetails';
import { TABS, type FileRow, type FileTab, type Subject } from '@/lib/types';

export function SubjectPage({ subjectId }: { subjectId: string }) {
  const { session, profile, canPublishDirectly } = useAuth();
  const { navigate } = useRouter();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [activeTab, setActiveTab] = useState<FileTab>('summaries');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function loadSubject() {
    const { data } = await supabase
      .from('subjects')
      .select('id, name, code, description, major, departments, created_by, created_at')
      .eq('id', subjectId)
      .maybeSingle();
    setSubject(data as Subject | null);
  }

  async function loadFiles() {
    const { data } = await supabase
      .from('files')
      .select('id, subject_id, tab, title, storage_path, file_url, file_type, uploader_id, status, created_at, uploader:profiles!files_uploader_id_fkey(id, full_name, role)')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });
    setFiles((data ?? []) as unknown as FileRow[]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadSubject(), loadFiles()]);
      setLoading(false);
    })();
  }, [subjectId]);

  const tabFiles = files.filter((f) => f.tab === activeTab);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      navigate('/auth');
      return;
    }
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const title = (fd.get('title') as string).trim();
    const file = fd.get('file') as File | null;
    if (!title || !file) {
      setToast({ message: 'يرجى إدخال العنوان واختيار الملف', type: 'error' });
      return;
    }

    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${profile!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('files').upload(path, file, { upsert: false });
    if (upErr) {
      setToast({ message: 'فشل رفع الملف: ' + upErr.message, type: 'error' });
      return;
    }
    const { data: pub } = supabase.storage.from('files').getPublicUrl(path);
    const { error: insErr } = await supabase.from('files').insert({
      subject_id: subjectId,
      tab: activeTab,
      title,
      storage_path: path,
      file_url: pub.publicUrl,
      file_type: ext,
    });
    if (insErr) {
      setToast({ message: 'فشل حفظ الملف: ' + insErr.message, type: 'error' });
      return;
    }
    setToast({
      message: canPublishDirectly ? 'تم نشر الملف مباشرة' : 'تم رفع الملف وهو قيد المراجعة',
      type: 'success',
    });
    setUploadOpen(false);
    form.reset();
    await loadFiles();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <Icon name="Loader2" className="mx-auto h-8 w-8 animate-spin text-brand-400" />
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

      {tabFiles.length === 0 ? (
        <div className="card p-12 text-center">
          <Icon name="FolderOpen" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
          <p className="text-slate-400">لا توجد ملفات في هذا القسم بعد.</p>
          {session && (
            <button onClick={() => setUploadOpen(true)} className="btn-ghost mt-4">
              <Icon name="Upload" className="h-4 w-4" /> ارفع أول ملف
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {tabFiles.map((f) => {
            const isOwn = profile?.id === f.uploader_id;
            const pending = f.status === 'pending';
            return (
              <div key={f.id} className={`card flex items-center gap-4 p-4 transition hover:border-white/10 ${pending && !isOwn ? 'opacity-50' : ''}`}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-700 text-brand-400">
                  <Icon name="File" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold text-slate-100">{f.title}</h3>
                    {pending && (
                      <span className="badge bg-accent-500/15 text-accent-400 border border-accent-500/30">
                        <Icon name="Clock" className="h-3 w-3" />
                        قيد المراجعة
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                    <span>{f.uploader?.full_name ?? 'مستخدم'}</span>
                    <span>·</span>
                    <span>{new Date(f.created_at).toLocaleDateString('ar')}</span>
                    {f.file_type && <><span>·</span><span className="uppercase">{f.file_type}</span></>}
                  </div>
                </div>
                {!pending || isOwn ? (
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="btn-ghost shrink-0" title="معاينة / تنزيل">
                    <Icon name="Eye" className="h-4 w-4" />
                    <span className="hidden sm:inline">عرض</span>
                  </a>
                ) : (
                  <span className="badge bg-ink-700 text-slate-500 border border-white/5 shrink-0">
                    <Icon name="Lock" className="h-3 w-3" /> مخفي
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title={`رفع ملف - ${TABS.find((t) => t.key === activeTab)?.label}`}>
        <form onSubmit={handleUpload} className="space-y-4">
          {!canPublishDirectly && (
            <div className="flex items-start gap-2 rounded-xl border border-accent-500/30 bg-accent-500/10 p-3 text-sm text-accent-400">
              <Icon name="AlertCircle" className="h-5 w-5 shrink-0" />
              <span>ستحتاج ملفاتك إلى موافقة المدير قبل نشرها للجميع.</span>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">عنوان الملف</label>
            <input name="title" required placeholder="مثال: ملخص الفصل الأول" className="input" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">الملف</label>
            <input
              name="file"
              type="file"
              required
              className="block w-full text-sm text-slate-300 file:ms-0 file:me-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-ink-950 file:font-bold hover:file:bg-brand-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUploadOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" className="btn-primary">
              <Icon name="Upload" className="h-4 w-4" /> رفع
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
