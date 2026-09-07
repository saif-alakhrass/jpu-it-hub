import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { matchSubject } from '@/lib/subjectSearch';
import { Icon } from '@/components/Icon';
import { GPACalculatorTab } from '@/components/assistant/GPACalculatorTab';
import { EnrolledCoursesHub } from '@/components/assistant/EnrolledCoursesHub';
import { CurrentLectureWidget } from '@/components/assistant/CurrentLectureWidget';
import { useStudentStorage } from '@/hooks/useStudentStorage';
import { useAllSubjects } from '@/hooks/useSubjects';
import '@/components/assistant/assistant.css';

const tabs = [
  { id: 'calculator', name: 'المعدل والمواد', icon: 'TrendingUp' },
  { id: 'library', name: 'مكتبة فصلي', icon: 'BookOpen' },
  { id: 'schedule', name: 'المواعيد', icon: 'Clock' },
] as const;
export function StudentAssistantPage() {
  const { data, update, error } = useStudentStorage();
  const { subjects, loading, error: libraryError } = useAllSubjects();
  // Resolve names entered while offline once the catalog arrives. Keep explicit
  // selections intact; no effect or extra local-storage write on every render.
  const resolvedData = useMemo(
    () => ({
      ...data,
      courses: data.courses.map((course) => ({
        ...course,
        subjectId: course.subjectId ?? matchSubject(course.name, subjects),
      })),
    }),
    [data, subjects],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // Keep navigation state in this history entry so Back/Forward (including
  // phone gestures) restores the library after the page has unmounted.
  const requestedTab = searchParams.get('tab');
  const tab = tabs.some(({ id }) => id === requestedTab)
    ? (requestedTab as (typeof tabs)[number]['id'])
    : 'calculator';
  const setTab = (next: (typeof tabs)[number]['id']) => {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next !== 'calculator') params.set('tab', next);
        else params.delete('tab');
        return params;
      },
      { replace: true },
    );
  };
  return (
    <div className="assistant-workspace" dir="rtl">
      <header className="assistant-header">
        <div>
          <p className="assistant-eyebrow">
            <span /> مساحة فصلك الدراسي
          </p>
          <h1>
            مساعد الطالب<span className="assistant-title-dot">.</span>
          </h1>
          <p className="assistant-intro">
            رتّب موادك، جرّب معدلك، ووصل لملفاتك من مكان واحد.
          </p>
        </div>
        <details className="assistant-privacy">
          <summary>
            <Icon name="ShieldCheck" /> محفوظ على جهازك{' '}
            <Icon name="ChevronDown" />
          </summary>
          <p>
            الحاسبة لا تحتاج تسجيل دخول. الحفظ محلي في هذا المتصفح، وليس مرتبطًا
            بالحساب أو متزامنًا بين الأجهزة. مسح بيانات المتصفح يحذفه، وقد يراه
            غيرك على الجهاز المشترك.
          </p>
        </details>
      </header>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          {error}
        </p>
      )}
      <div
        role="tablist"
        aria-label="أدوات مساعد الطالب"
        className="assistant-tabs"
      >
        {tabs.map((t, index) => (
          <button
            key={t.id}
            id={`assistant-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`assistant-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="assistant-tab"
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              const next =
                e.key === 'ArrowLeft'
                  ? (index + 1) % tabs.length
                  : e.key === 'ArrowRight'
                    ? (index + tabs.length - 1) % tabs.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                e.preventDefault();
                setTab(tabs[next]!.id);
                document
                  .getElementById(`assistant-tab-${tabs[next]!.id}`)
                  ?.focus();
              }
            }}
          >
            <Icon name={t.icon} />
            <span>{t.name}</span>
            <span className="assistant-tab-index" aria-hidden="true">
              0{index + 1}
            </span>
          </button>
        ))}
      </div>
      <div
        id={`assistant-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`assistant-tab-${tab}`}
      >
        {tab === 'calculator' && (
          <GPACalculatorTab
            data={resolvedData}
            onChange={update}
            subjects={subjects}
          />
        )}
        {tab === 'library' && (
          <EnrolledCoursesHub
            courses={resolvedData.courses}
            subjects={subjects}
            loading={loading}
            error={libraryError}
            onEditCourses={() => {
              setTab('calculator');
              document.getElementById('assistant-tab-calculator')?.focus();
            }}
          />
        )}
        {tab === 'schedule' && (
          <CurrentLectureWidget data={data} onChange={update} />
        )}
      </div>
    </div>
  );
}
