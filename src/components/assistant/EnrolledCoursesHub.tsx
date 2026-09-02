import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getVisibleTabs, type Subject } from '@/lib/types';
import { fetchAssistantLibraryCounts } from '@/services/assistantLibrary';
import type { EnrolledCourse } from '@/lib/studentAssistant';

export function EnrolledCoursesHub({
  courses,
  subjects,
  loading,
  error,
}: {
  courses: EnrolledCourse[];
  subjects: Subject[];
  loading: boolean;
  error: unknown;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { session, profile } = useAuth();
  // Never reuse a previous role's exam counters after logout/demotion. RLS is
  // still the authority; these counters request only the currently visible tabs.
  const role = session && profile?.id === session.user.id ? profile.role : null;
  const linked = courses.map((c) => ({
    course: c,
    subject: subjects.find((s) => s.id === c.subjectId),
  }));
  const active =
    linked.find((c) => c.course.id === selected) ??
    linked.find((c) => c.subject);
  const subjectId = active?.subject?.id;
  const counts = useQuery({
    queryKey: [
      'assistant-library',
      session?.user.id ?? 'anonymous',
      role,
      subjectId,
    ],
    queryFn: () => fetchAssistantLibraryCounts(subjectId!, role),
    enabled: Boolean(subjectId && session),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">مكتبة مواد فصلك</h2>
        <p className="mt-1 text-sm text-slate-400">
          اختر مادة لعرض أعداد الملفات المعتمدة. روابط الأقسام تفتح أحدث الملفات
          أولًا، مع الصلاحيات نفسها الموجودة في المكتبة.
        </p>
      </div>
      {loading && (
        <p role="status" className="text-sm text-slate-400">
          جارٍ تحميل دليل المواد… أدوات الحساب والجدول تعمل دون اتصال.
        </p>
      )}
      {Boolean(error) && (
        <p role="alert" className="text-sm text-red-800">
          تعذر تحديث دليل المكتبة. بيانات فصلك المحلية محفوظة؛ حاول لاحقًا.
        </p>
      )}
      {!courses.length && (
        <p className="card p-6 text-sm text-slate-400">
          أضف مادة من الحاسبة لربطها بالمكتبة.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {linked.map(({ course, subject }) => (
          <div
            className={`card p-4 ${active?.course.id === course.id ? 'border-brand-300 bg-brand-50' : ''}`}
            key={course.id}
          >
            <h3 className="break-words font-bold">
              {course.name || 'مادة بدون اسم'}
            </h3>
            {subject ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn-ghost text-sm"
                  onClick={() => setSelected(course.id)}
                  aria-pressed={active?.course.id === course.id}
                >
                  ملفات المادة
                </button>
                <Link
                  className="btn-ghost text-sm"
                  to={`/subject/${subject.id}`}
                >
                  فتح المكتبة
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-6 text-slate-400">
                غير مرتبطة بمادة متاحة. يمكنك تحديد المادة المطابقة من الحاسبة،
                أو إبقاؤها خاصة.
              </p>
            )}
          </div>
        ))}
      </div>
      {active?.subject && (
        <section className="card p-4 sm:p-6">
          <h3 className="font-bold">ملفات {active.subject.name}</h3>
          {counts.isError ? (
            <div className="mt-3 text-sm text-red-800">
              تعذر جلب أعداد الملفات.{' '}
              <button
                className="underline"
                onClick={() => void counts.refetch()}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {getVisibleTabs(role)
                .filter((t) => t.key !== 'images')
                .map((tab) => (
                  <Link
                    key={tab.key}
                    to={`/subject/${active.subject!.id}?tab=${tab.key}`}
                    className="rounded-xl border border-ink-600 bg-ink-950 p-4 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <p className="text-sm">{tab.label}</p>
                    <p className="mt-2 text-xl font-bold text-brand-800">
                      {session ? (counts.data?.[tab.key] ?? '…') : '—'}
                    </p>
                    <p className="mt-1 text-xs text-brand-700">
                      تصفح أحدث الملفات ←
                    </p>
                  </Link>
                ))}
            </div>
          )}
          {!session && (
            <p className="mt-3 text-sm text-slate-300">
              <Link to="/auth" className="text-brand-700 underline">
                سجّل الدخول
              </Link>{' '}
              لعرض أعداد الملفات المتاحة لحسابك. الحاسبة والجدول لا يحتاجان إلى
              حساب.
            </p>
          )}
          {role !== 'admin' && role !== 'trusted' && (
            <p className="mt-3 text-xs text-slate-400">
              السنوات السابقة متاحة للحسابات الموثوقة وفق صلاحيات الموقع.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
