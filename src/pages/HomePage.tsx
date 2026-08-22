import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Toast } from '@/components/Toast';
import { Pagination } from '@/components/Pagination';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/lib/router';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { getCourseMeta } from '@/lib/courseDetails';
import { MAJORS, type Difficulty } from '@/lib/types';
import { SubjectCardSkeletonGrid } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { useSubjectsPaged } from '@/hooks/useSubjects';
import { createSubject } from '@/services/subjects';
import { getUserErrorMessage } from '@/lib/serviceError';
import { useQueryClient } from '@tanstack/react-query';
import { SUBJECT_STALE_TIME } from '@/hooks/useSubjects';
import { fetchSubject } from '@/services/subjects';
import { fetchBatchesForSubject, fetchFilesForSubject } from '@/services/files';
import { scrollPageTo } from '@/lib/scroll';

const HOME_VIEW_KEY = 'jpu-it-hub:home-view';

interface HomeViewState {
  search: string;
  major: string;
  page: number;
}

function readHomeView(): HomeViewState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HOME_VIEW_KEY) ?? '{}') as Partial<HomeViewState>;
    return {
      search: typeof saved.search === 'string' ? saved.search : '',
      major: typeof saved.major === 'string' && MAJORS.includes(saved.major) ? saved.major : (MAJORS[0] ?? ''),
      page: Number.isInteger(saved.page) && (saved.page ?? 0) >= 0 ? saved.page! : 0,
    };
  } catch {
    return { search: '', major: MAJORS[0] ?? '', page: 0 };
  }
}

export function HomePage() {
  const { session, isTrusted } = useAuth();
  const { navigate } = useRouter();
  const queryClient = useQueryClient();
  const [initialView] = useState(readHomeView);
  const [search, setSearch] = useState(initialView.search);
  const [major, setMajor] = useState<string>(initialView.major);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [newMajor, setNewMajor] = useState<string>(MAJORS[0] ?? '');
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, error, page, setPage, reload } = useSubjectsPaged(search, major, initialView.page);
  const restoredScroll = useRef(false);

  function warmSubject(subjectId: string, includeContent = false) {
    void import('@/pages/SubjectPage');
    void queryClient.prefetchQuery({
      queryKey: ['subjects', 'detail', subjectId],
      queryFn: () => fetchSubject(subjectId),
      staleTime: SUBJECT_STALE_TIME,
    });
    if (!includeContent) return;
    void queryClient.prefetchQuery({
      queryKey: ['files', 'subject', subjectId, 'all'],
      queryFn: () => fetchFilesForSubject(subjectId),
    });
    void queryClient.prefetchQuery({
      queryKey: ['batches', 'subject', subjectId, 'all'],
      queryFn: () => fetchBatchesForSubject(subjectId),
    });
  }

  useEffect(() => {
    sessionStorage.setItem(HOME_VIEW_KEY, JSON.stringify({ search, major, page }));
  }, [search, major, page]);

  useEffect(() => {
    if (loading || restoredScroll.current) return;
    const rawPosition = sessionStorage.getItem('jpu-it-hub:scroll:/');
    const target = rawPosition === null ? 0 : Number(rawPosition);
    if (!Number.isFinite(target) || target <= 0) return;

    restoredScroll.current = true;
    // This page owns the list height. Restore only after cards are rendered
    // (from cache or the first response), not while a short loading shell is up.
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollPageTo(target));
    });
    return () => cancelAnimationFrame(firstFrame);
  }, [loading, data.items.length]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) {
      navigate('/auth');
      return;
    }
    if (!isTrusted) {
      setToast({ message: 'إضافة المواد متاحة للحسابات الموثوقة والمدير فقط.', type: 'error' });
      return;
    }
    setSubmitting(true);
    const created = await createSubject({ name, description: desc || null, major: newMajor, departments: [newMajor] });
    setSubmitting(false);
    if (!created) {
      setToast({ message: 'فشل إنشاء المادة', type: 'error' });
      return;
    }
    setCreateOpen(false);
    setName(''); setDesc('');
    setToast({ message: 'تم إنشاء المادة بنجاح', type: 'success' });
    void reload();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="mb-8 border-b border-ink-600 pb-8 pt-3 md:pb-10">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold text-brand-600">جامعة جرش · كلية تكنولوجيا المعلومات</p>
          <h1 className="text-3xl font-bold text-slate-100 md:text-5xl leading-tight">
            مكتبة <span className="text-brand-600">JPU-IT</span> الأكاديمية
          </h1>
          <p className="mt-3 max-w-2xl text-slate-400 md:text-lg">
            مكان مرتب لملخصات المواد، الامتحانات السابقة، السلايدات والكتب. اختر المادة، ثم افتح القسم الذي تحتاجه.
          </p>
        </div>
      </section>

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
          {MAJORS.map((m) => (
            <button
              key={m}
              onClick={() => setMajor(m)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                major === m
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-300 hover:border-brand-300 hover:text-brand-700 border border-ink-600'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {isTrusted && (
          <button onClick={() => session ? setCreateOpen(true) : navigate('/auth')} className="btn-primary shrink-0">
            <Icon name="Plus" className="h-4 w-4" />
            مادة جديدة
          </button>
        )}
      </div>

      {loading ? (
        <SubjectCardSkeletonGrid count={20} />
      ) : error ? (
        <EmptyState
          icon="WifiOff"
          title="تعذر تحميل المواد"
          message={getUserErrorMessage(error, 'حدثت مشكلة أثناء الاتصال بقاعدة البيانات. تحقق من اتصالك وحاول مجددًا.')}
          ctaLabel="إعادة المحاولة"
          onCta={() => void reload()}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon="FolderOpen"
          title="لا توجد مواد مطابقة"
          message={isTrusted ? "لم نجد مواد تطابق بحثك. يمكنك إضافة مادة في هذا التخصص." : "لم نجد مواد تطابق بحثك."}
          ctaLabel={isTrusted ? "إضافة مادة جديدة" : undefined}
          onCta={isTrusted ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((s) => {
              const depts = s.departments?.length ? s.departments : [s.major];
              const isShared = depts.length > 1;
              const meta = getCourseMeta(s.name, s.course_description ?? s.description);
              const difficulty: Difficulty = s.difficulty ?? meta.difficulty;
              const description = s.course_description ?? s.description ?? meta.description;
              return (
                <button
                  key={s.id}
                  onClick={() => { warmSubject(s.id, true); navigate(`/subject/${s.id}`); }}
                  onPointerEnter={(event) => { if (event.pointerType === 'mouse') warmSubject(s.id); }}
                  onPointerDown={(event) => { if (event.pointerType === 'mouse') warmSubject(s.id, true); }}
                  onFocus={() => warmSubject(s.id)}
                  className="performance-item card group p-5 text-right transition-all duration-300 hover:border-brand-300 hover:shadow-glow"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
                      <Icon name="BookOpen" className="h-5 w-5" />
                    </span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {depts.map((d) => (
                        <span key={d} className="badge bg-ink-800 text-slate-300 border border-ink-600 text-[10px]">
                          {d}
                        </span>
                      ))}
                      {isShared && (
                        <span className="badge bg-brand-500/15 text-brand-300 border border-brand-500/30 text-[10px]">
                          <Icon name="Layers" className="h-3 w-3" />
                          مشترك
                        </span>
                      )}
                    </div>
                  </div>
                  <h3 className="mb-1 text-lg font-bold text-slate-100 group-hover:text-brand-300 transition">
                    {s.name}
                  </h3>
                  {s.code && (
                    <span className="mb-1 inline-block font-mono text-xs text-brand-600">{s.code}</span>
                  )}
                  <p className="text-sm text-slate-400 line-clamp-2 min-h-[2.5rem]">
                    {description}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <DifficultyBadge difficulty={difficulty} />
                    <span className="flex items-center gap-1 text-xs text-brand-600 font-bold opacity-0 transition group-hover:opacity-100">
                      عرض الموارد
                      <Icon name="ChevronLeft" className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <Pagination page={page} totalPages={data.totalPages} onPageChange={setPage} />
        </>
      )}

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
