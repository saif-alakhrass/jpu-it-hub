import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { getVisibleTabs, type Subject } from '@/lib/types';
import { fetchAssistantLibraryCounts } from '@/services/assistantLibrary';
import type { EnrolledCourse } from '@/lib/studentAssistant';

export function EnrolledCoursesHub({
  courses,
  subjects,
  loading,
  error,
  onEditCourses,
}: {
  courses: EnrolledCourse[];
  subjects: Subject[];
  loading: boolean;
  error: unknown;
  onEditCourses: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { session, profile } = useAuth();
  // Scope the cache to the signed-in user and current role; RLS stays authoritative.
  const role = session && profile?.id === session.user.id ? profile.role : null;
  const linked = courses.map((course) => ({
    course,
    subject: subjects.find((s) => s.id === course.subjectId),
  }));
  const active =
    linked.find((c) => c.course.id === selected) ??
    linked.find((c) => c.subject) ??
    linked[0];
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
    <div className="assistant-library">
      <div className="assistant-library-intro">
        <div>
          <p className="assistant-eyebrow">من موادك إلى ملفاتك</p>
          <h2>مكتبة مواد فصلك</h2>
          <p>اختر المادة، وستجد أقسامها هنا. أحدث الملفات أولًا.</p>
        </div>
        <button
          className="assistant-button assistant-button-outline"
          onClick={onEditCourses}
        >
          <Icon name="Pencil" /> تعديل مواد الفصل
        </button>
      </div>
      {loading && (
        <p role="status" className="assistant-inline-notice">
          <Icon name="Loader2" className="animate-spin" /> جارٍ تحميل دليل
          المواد… الحاسبة تعمل دون اتصال.
        </p>
      )}
      {Boolean(error) && (
        <p role="alert" className="assistant-warning">
          تعذر تحديث دليل المكتبة. بيانات فصلك المحلية محفوظة؛ حاول لاحقًا.
        </p>
      )}
      {!courses.length ? (
        <div className="assistant-surface assistant-empty assistant-library-empty">
          <span className="assistant-empty-icon">
            <Icon name="FolderOpen" />
          </span>
          <h3>مكتبتك تبدأ بموادك</h3>
          <p>
            أضف مواد هذا الفصل في الحاسبة واربطها بمواد الموقع، لتصل إلى ملفاتها
            من هنا.
          </p>
          <button className="assistant-button" onClick={onEditCourses}>
            أضف مواد فصلك <Icon name="ArrowLeft" />
          </button>
        </div>
      ) : (
        <div className="assistant-library-layout">
          <aside className="assistant-shelf" aria-label="مواد فصلي">
            <div className="assistant-shelf-heading">
              <h3>مواد الفصل</h3>
              <span className="assistant-count">{courses.length}</span>
            </div>
            <label className="assistant-field assistant-mobile-subject">
              المادة الحالية
              <select
                className="input"
                value={active?.course.id ?? ''}
                onChange={(e) => setSelected(e.target.value)}
              >
                {linked.map(({ course, subject }) => (
                  <option key={course.id} value={course.id}>
                    {course.name || 'مادة بدون اسم'}
                    {subject ? '' : ' — غير مرتبطة'}
                  </option>
                ))}
              </select>
            </label>
            <div className="assistant-shelf-list">
              {linked.map(({ course, subject }, index) => (
                <button
                  className="assistant-shelf-item"
                  key={course.id}
                  aria-pressed={active?.course.id === course.id}
                  onClick={() => setSelected(course.id)}
                >
                  <span className="assistant-shelf-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="assistant-shelf-name">
                      {course.name || 'مادة بدون اسم'}
                    </span>
                    <span className="assistant-shelf-meta">
                      {course.hours || '—'} ساعات ·{' '}
                      {subject
                        ? subject.code || 'مرتبطة بالمكتبة'
                        : 'غير مرتبطة'}
                    </span>
                  </span>
                  <Icon name="ChevronLeft" />
                </button>
              ))}
            </div>
            <p className="assistant-shelf-note">
              <Icon name="BookMarked" /> نفس المواد التي أضفتها في الحاسبة.
            </p>
          </aside>
          <section
            className="assistant-library-content"
            aria-label={
              active?.subject
                ? 'ملفات ' + active.subject.name
                : 'ربط المادة بالمكتبة'
            }
          >
            {active?.subject ? (
              <>
                <header className="assistant-library-course-header">
                  <span className="assistant-library-course-icon">
                    <Icon name="BookOpen" />
                  </span>
                  <div>
                    <p>{active.subject.code || 'مادة من مكتبة الموقع'}</p>
                    <h3>{active.subject.name}</h3>
                    <span>{active.subject.major}</span>
                  </div>
                  <Link
                    className="assistant-library-open"
                    to={'/subject/' + active.subject.id}
                  >
                    فتح المكتبة <Icon name="ArrowLeft" />
                  </Link>
                </header>
                <div className="assistant-library-section-label">
                  <h4>أقسام المادة</h4>
                  <span>الملفات المعتمدة فقط</span>
                </div>
                {counts.isError ? (
                  <div className="assistant-warning">
                    <Icon name="WifiOff" />
                    <div>
                      تعذر جلب أعداد الملفات.
                      <button
                        className="assistant-text-button"
                        onClick={() => void counts.refetch()}
                      >
                        إعادة المحاولة
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="assistant-file-categories">
                    {getVisibleTabs(role)
                      .filter((t) => t.key !== 'images')
                      .map((tab) => (
                        <Link
                          key={tab.key}
                          to={
                            '/subject/' + active.subject!.id + '?tab=' + tab.key
                          }
                          className={
                            'assistant-file-category assistant-category-' +
                            tab.key
                          }
                        >
                          <div className="assistant-category-top">
                            <span className="assistant-category-icon">
                              <Icon name={tab.icon} />
                            </span>
                            <Icon name="ArrowLeft" />
                          </div>
                          <h4>{tab.label}</h4>
                          <p>
                            {tab.key === 'summaries'
                              ? 'للمراجعة وفهم المادة'
                              : tab.key === 'slides'
                                ? 'المحاضرات والمراجع'
                                : 'للتدريب قبل الامتحان'}
                          </p>
                          <div className="assistant-category-bottom">
                            <span className="assistant-category-count">
                              {session ? (counts.data?.[tab.key] ?? '…') : '—'}{' '}
                              <small>
                                {session && counts.data ? 'ملف' : 'ملفات'}
                              </small>
                            </span>
                            <span>تصفح الملفات</span>
                          </div>
                        </Link>
                      ))}
                  </div>
                )}
                {!session && (
                  <div className="assistant-library-auth">
                    <Icon name="Lock" />
                    <p>
                      <Link to="/auth">سجّل الدخول</Link> لعرض أعداد الملفات
                      المتاحة لحسابك. الحاسبة لا تحتاج إلى حساب.
                    </p>
                  </div>
                )}
                {role !== 'admin' && role !== 'trusted' && (
                  <p className="assistant-note">
                    السنوات السابقة متاحة للحسابات الموثوقة وفق صلاحيات الموقع.
                  </p>
                )}
              </>
            ) : (
              <div className="assistant-empty">
                <span className="assistant-empty-icon">
                  <Icon name="BookX" />
                </span>
                <h3>
                  {active?.course.name || 'هذه المادة'} غير مرتبطة بالمكتبة
                </h3>
                <p>
                  تبقى ضمن حساب المعدل. لعرض ملفاتها، اختر المادة المطابقة من
                  «الربط بالمكتبة وإعادة المادة» في الحاسبة.
                </p>
                <button
                  className="assistant-button assistant-button-outline"
                  onClick={onEditCourses}
                >
                  تحديد المادة المطابقة <Icon name="ArrowLeft" />
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
