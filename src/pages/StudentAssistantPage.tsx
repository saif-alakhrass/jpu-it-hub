import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { GPACalculatorTab } from '@/components/assistant/GPACalculatorTab';
import { EnrolledCoursesHub } from '@/components/assistant/EnrolledCoursesHub';
import { ScheduleTab } from '@/components/assistant/ScheduleTab';
import { SemesterSummaryCard } from '@/components/assistant/SemesterSummaryCard';
import { useStudentStorage } from '@/hooks/useStudentStorage';
import { useAllSubjects } from '@/hooks/useSubjects';

const tabs = [
  { id: 'calculator', name: 'المعدل والمواد', icon: 'TrendingUp' },
  { id: 'library', name: 'مكتبة فصلي', icon: 'BookOpen' },
  { id: 'schedule', name: 'الجدول والمواعيد', icon: 'Clock' },
  { id: 'card', name: 'بطاقة الفصل', icon: 'Image' },
] as const;
export function StudentAssistantPage() {
  const { data, update, error } = useStudentStorage();
  const { subjects, loading, error: libraryError } = useAllSubjects();
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('calculator');
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10" dir="rtl">
      <header className="mb-6 rounded-2xl border border-brand-200 bg-gradient-to-bl from-brand-100 via-brand-50 to-white p-5 sm:p-8">
        <p className="text-xs font-bold text-brand-700">
          فصل واحد · أدوات مترابطة
        </p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          مساعد الطالب
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
          أدخل موادك مرة واحدة، جرّب معدلك المتوقع، ورتّب مواعيدك. بياناتك تبقى
          في هذا المتصفح ولا تحتاج تسجيل دخول للحاسبة والجدول.
        </p>
        <p className="mt-2 text-xs leading-6 text-slate-400">
          الحفظ محلي على الجهاز، وليس مرتبطًا بالحساب أو متزامنًا بين الأجهزة.
          مسح بيانات المتصفح يحذفه، وقد يراه غيرك على الجهاز المشترك.
        </p>
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
        className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {tabs.map((t, index) => (
          <button
            key={t.id}
            id={`assistant-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`assistant-panel-${tab}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold transition-colors ${tab === t.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-600 bg-white text-slate-200 hover:bg-brand-50'}`}
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
            <Icon name={t.icon} className="h-4 w-4 shrink-0" />
            {t.name}
          </button>
        ))}
      </div>
      <div
        id={`assistant-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`assistant-tab-${tab}`}
      >
        {tab === 'calculator' && (
          <GPACalculatorTab data={data} onChange={update} subjects={subjects} />
        )}
        {tab === 'library' && (
          <EnrolledCoursesHub
            courses={data.courses}
            subjects={subjects}
            loading={loading}
            error={libraryError}
          />
        )}
        {tab === 'schedule' && <ScheduleTab data={data} onChange={update} />}
        {tab === 'card' && (
          <SemesterSummaryCard data={data} onChange={update} />
        )}
      </div>
    </div>
  );
}
