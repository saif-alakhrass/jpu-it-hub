import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { calculateGpa, classifyAverage } from '@/lib/gpaEngine';
import { downloadBlob } from '@/lib/downloadBlob';
import type { StudentSemester } from '@/lib/studentAssistant';

export function SemesterSummaryCard({
  data,
  onChange,
}: {
  data: StudentSemester;
  onChange: (data: StudentSemester) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The printable copy is outside the app's layout so only the card is
  // printed, without navigation, form inputs or off-screen blank pages.
  useEffect(() => {
    document.body.classList.add('semester-card-printing');
    return () => document.body.classList.remove('semester-card-printing');
  }, []);
  async function exportCard() {
    setBusy(true);
    setError('');
    try {
      const { renderSemesterCard } = await import('@/lib/semesterCard');
      downloadBlob(await renderSemesterCard(data), 'jpu-semester.png');
    } catch {
      setError('تعذر تصدير الصورة على هذا المتصفح. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="text-lg font-bold">بطاقة الفصل</h2>
        <p className="mt-1 text-sm text-slate-400">
          احفظ أو اطبع الاسم والتخصص والمواد والمعدل الفصلي والتراكمي في بطاقة
          واحدة، دون جدول أو مواعيد. لا تتم مشاركة أي شيء تلقائيًا.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            اسم الطالب (اختياري)
            <input
              className="input"
              maxLength={100}
              value={data.name}
              onChange={(e) => onChange({ ...data, name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            التخصص (اختياري)
            <input
              className="input"
              maxLength={100}
              value={data.major}
              onChange={(e) => onChange({ ...data, major: e.target.value })}
            />
          </label>
        </div>
      </section>
      <section
        className="rounded-2xl border border-brand-200 bg-gradient-to-b from-brand-50 to-white p-5 sm:p-8"
        aria-label="معاينة بطاقة الفصل"
      >
        <CardContents data={data} />
      </section>
      {createPortal(
        <div className="semester-card-print-root" dir="rtl">
          <CardContents data={data} />
        </div>,
        document.body,
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          type="button"
          onClick={() => window.print()}
        >
          طباعة بطاقة الفصل
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => void exportCard()}
        >
          <Icon
            name={busy ? 'Loader2' : 'Download'}
            className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}
          />
          {busy ? 'جارٍ تجهيز الصورة…' : 'حفظ البطاقة PNG'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function CardContents({ data }: { data: StudentSemester }) {
  const result = calculateGpa(data);
  return (
    <>
      <p className="text-sm font-bold text-brand-700">
        JPU-IT Hub · بطاقة الفصل
      </p>
      <h3 className="mt-2 break-words text-2xl font-bold">
        {data.name || 'فصلي الدراسي'}
      </h3>
      <p className="mt-1 text-sm text-slate-400">{data.major}</p>
      <div className="my-5 flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-white p-3">
          المعدل الفصلي:{' '}
          {result.semester === null
            ? 'غير مكتمل'
            : `${result.semester.toFixed(2)}%`}
        </span>
        <span className="rounded-lg bg-white p-3">
          {data.courses.length} مواد · {result.semesterHours} ساعات
        </span>
        <span className="rounded-lg bg-white p-3">
          التراكمي:{' '}
          {result.cumulative === null
            ? 'غير مكتمل'
            : `${result.cumulative.toFixed(2)}% — ${classifyAverage(result.cumulative).label}`}
        </span>
      </div>
      <ul className="mb-6 space-y-2">
        {data.courses.map((c) => (
          <li
            className="flex break-inside-avoid justify-between gap-3 border-b border-brand-100 pb-2 text-sm"
            key={c.id}
          >
            <span className="break-words">{c.name || 'مادة بدون اسم'}</span>
            <span className="shrink-0">{c.hours || '—'} ساعات</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-slate-400">
        محاكاة شخصية وليست كشف علامات رسميًا.
      </p>
    </>
  );
}
