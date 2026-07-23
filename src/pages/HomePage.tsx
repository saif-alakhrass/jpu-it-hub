import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { MAJORS, type Subject } from '@/lib/types';

export function HomePage() {
  const { session } = useAuth();
  const { navigate } = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [major, setMajor] = useState<string>('الكل');
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // create form
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [newMajor, setNewMajor] = useState(MAJORS[0]);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, code, description, major, created_by, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setToast({ message: 'تعذر تحميل المواد', type: 'error' });
    } else {
      setSubjects((data ?? []) as Subject[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return subjects.filter((s) => {
      const matchSearch = !search || s.name.includes(search) || (s.description ?? '').includes(search);
      const matchMajor = major === 'الكل' || s.major === major;
      return matchSearch && matchMajor;
    });
  }, [subjects, search, major]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      navigate('/auth');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from('subjects')
      .insert({ name, description: desc || null, major: newMajor })
      .select('id, name, code, description, major, created_by, created_at')
      .maybeSingle();
    setSubmitting(false);
    if (error || !data) {
      setToast({ message: error?.message ?? 'فشل إنشاء المادة', type: 'error' });
      return;
    }
    setSubjects((prev) => [data as Subject, ...prev]);
    setCreateOpen(false);
    setName(''); setDesc('');
    setToast({ message: 'تم إنشاء المادة بنجاح', type: 'success' });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero */}
      <section className="relative overflow-hidden card mb-10 p-8 md:p-12">
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative">
          <span className="badge bg-brand-500/15 text-brand-300 border border-brand-500/30 mb-4">
            <Icon name="Sparkles" className="h-3.5 w-3.5" />
            منصة الطلاب الذكية
          </span>
          <h1 className="text-3xl font-extrabold text-slate-100 md:text-5xl leading-tight">
            مركز <span className="text-brand-400">JPU-IT</span> للموارد الأكاديمية
          </h1>
          <p className="mt-3 max-w-2xl text-slate-400 md:text-lg">
            ملخصات، امتحانات سابقة، سلايدات، وكتب لكل مواد كلية تكنولوجيا المعلومات في جامعة جرش —
            يرفعها الطلاب، ويراجعها المشرفون لضمان الجودة.
          </p>
        </div>
      </section>

      {/* Controls */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Icon name="Search" className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن مادة..."
            className="input pr-11"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Icon name="Filter" className="h-4 w-4 shrink-0 text-slate-500" />
          {['الكل', ...MAJORS].map((m) => (
            <button
              key={m}
              onClick={() => setMajor(m)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                major === m
                  ? 'bg-brand-500 text-ink-950'
                  : 'bg-ink-800 text-slate-300 hover:bg-ink-700 border border-white/5'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button onClick={() => session ? setCreateOpen(true) : navigate('/auth')} className="btn-primary shrink-0">
          <Icon name="Plus" className="h-4 w-4" />
          مادة جديدة
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Icon name="FolderOpen" className="mx-auto mb-3 h-12 w-12 text-slate-600" />
          <p className="text-slate-400">لا توجد مواد مطابقة. كن أول من يضيف مادة!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/subject/${s.id}`)}
              className="card group p-5 text-right transition-all duration-200 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-glow"
            >
              <div className="mb-3 flex items-start justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-700 text-brand-400 transition group-hover:bg-brand-500 group-hover:text-ink-950">
                  <Icon name="BookOpen" className="h-5 w-5" />
                </span>
                <span className="badge bg-ink-700 text-slate-300 border border-white/5">{s.major}</span>
              </div>
              <h3 className="mb-1 text-lg font-bold text-slate-100 group-hover:text-brand-300 transition">
                {s.name}
              </h3>
              {s.code && (
                <span className="mb-1 inline-block font-mono text-xs text-brand-400/80">{s.code}</span>
              )}
              <p className="text-sm text-slate-400 line-clamp-2 min-h-[2.5rem]">
                {s.description ?? 'لا يوجد وصف'}
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-brand-400 font-bold opacity-0 transition group-hover:opacity-100">
                عرض الموارد
                <Icon name="ChevronLeft" className="h-4 w-4" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء مادة جديدة">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">اسم المادة</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="مثال: برمجة 1"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">التخصص</label>
            <select value={newMajor} onChange={(e) => setNewMajor(e.target.value)} className="input">
              {MAJORS.map((m) => (
                <option key={m} value={m} className="bg-ink-900">{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-slate-300">الوصف (اختياري)</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="نبذة قصيرة عن المادة..."
              className="input resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="btn-ghost">إلغاء</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Icon name="Loader2" className="h-4 w-4 animate-spin" /> : <Icon name="Plus" className="h-4 w-4" />}
              إنشاء
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
