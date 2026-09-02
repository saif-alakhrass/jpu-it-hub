import { memo } from 'react';
import { Icon } from '@/components/Icon';
import { calculateGpa, classifyAverage } from '@/lib/gpaEngine';
import {
  MAX_COURSES,
  newCourse,
  type EnrolledCourse,
  type StudentSemester,
} from '@/lib/studentAssistant';
import { matchSubject } from '@/lib/assistantSubjects';
import type { Subject } from '@/lib/types';

const formatAverage = (value: number | null) =>
  value === null ? '—' : `${value.toFixed(2)}%`;
interface Props {
  data: StudentSemester;
  onChange: (data: StudentSemester) => void;
  subjects: Subject[];
}

export function GPACalculatorTab({ data, onChange, subjects }: Props) {
  const result = calculateGpa(data);
  const rating =
    result.cumulative === null ? null : classifyAverage(result.cumulative);
  function changeCourse(id: string, patch: Partial<EnrolledCourse>) {
    onChange({
      ...data,
      courses: data.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }
  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-6" aria-labelledby="gpa-base">
        <h2 id="gpa-base" className="text-lg font-bold">
          قبل هذا الفصل
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          أدخل الساعات الداخلة في حساب المعدل، بما فيها المادة المعادة، وليس
          ساعات النجاح فقط.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            الساعات السابقة المحتسبة
            <input
              className="input"
              type="number"
              min="0"
              max="400"
              step="0.5"
              value={data.previousHours}
              onChange={(e) =>
                onChange({ ...data, previousHours: e.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            المعدل التراكمي السابق (%)
            <input
              className="input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={data.previousAverage}
              onChange={(e) =>
                onChange({ ...data, previousAverage: e.target.value })
              }
              placeholder="مثلاً 72.5"
            />
          </label>
        </div>
      </section>
      <section aria-labelledby="semester-courses" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="semester-courses" className="text-lg font-bold">
            مواد هذا الفصل{' '}
            <span className="text-sm text-slate-400">
              ({data.courses.length})
            </span>
          </h2>
          <button
            className="btn-primary"
            disabled={data.courses.length >= MAX_COURSES}
            onClick={() =>
              onChange({ ...data, courses: [...data.courses, newCourse()] })
            }
          >
            <Icon name="Plus" className="h-4 w-4" /> أضف مادة
          </button>
        </div>
        <datalist id="assistant-subjects">
          {subjects.map((s) => (
            <option key={s.id} value={s.name}>
              {s.code} · {s.major}
            </option>
          ))}
        </datalist>
        {!data.courses.length && (
          <div className="card p-8 text-center text-slate-400">
            ابدأ بإضافة موادك. ستظهر تلقائيًا في الجدول والمكتبة والبطاقة.
          </div>
        )}
        {data.courses.map((c, index) => (
          <CourseEditor
            key={c.id}
            course={c}
            index={index}
            subjects={subjects}
            onChange={(patch) => changeCourse(c.id, patch)}
            onRemove={() => {
              if (
                window.confirm(
                  `حذف «${c.name || 'هذه المادة'}» ومواعيدها من مساعدك المحلي؟ لا يحذف ذلك شيئًا من مكتبة الموقع.`,
                )
              )
                onChange({
                  ...data,
                  courses: data.courses.filter((x) => x.id !== c.id),
                });
            }}
          />
        ))}
      </section>
      {result.errors.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <ul className="list-inside list-disc">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <section className="card p-4 sm:p-6" aria-labelledby="gpa-result">
        <h2 id="gpa-result" className="text-lg font-bold">
          توقعات الفصل
        </h2>
        {!result.gradesComplete && (
          <p className="mt-2 text-sm text-slate-400">
            أكمل العلامات المتوقعة لإظهار المعدل. العلامة الفارغة لا تُحسب
            صفرًا.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="ساعات الفصل" value={String(result.semesterHours)} />
          <Metric
            label="المعدل الفصلي"
            value={formatAverage(result.semester)}
          />
          <Metric
            label="التراكمي المتوقع"
            value={formatAverage(result.cumulative)}
          />
          <Metric label="الساعات بعد الفصل" value={String(result.totalHours)} />
        </div>
        {rating && (
          <p
            className={`mt-4 inline-block rounded-lg px-3 py-2 text-sm font-bold ${rating.tone}`}
          >
            {rating.label}
          </p>
        )}
        {result.cumulative !== null && result.cumulative < 60 && (
          <p className="mt-2 text-sm text-red-800">
            المعدل المتوقع أقل من 60% وقد يعرّضك للإنذار الأكاديمي. راجع مرشدك؛
            الإنذار الفعلي تحكمه تعليمات الجامعة وحالتك الدراسية.
          </p>
        )}
      </section>
      <section className="card p-4 sm:p-6">
        <h2 className="text-lg font-bold">ما العلامات التي أحتاجها لهدفي؟</h2>
        <label className="mt-3 block max-w-xs space-y-1 text-sm">
          التراكمي المستهدف (%)
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={data.target}
            onChange={(e) => onChange({ ...data, target: e.target.value })}
          />
        </label>
        {result.targetInvalid && (
          <p role="alert" className="mt-2 text-sm text-red-800">
            الهدف يجب أن يكون بين 0 و100.
          </p>
        )}
        {result.required === null ? (
          <p className="mt-3 text-sm text-slate-400">
            أدخل الهدف والساعات وبيانات الإعادة؛ لا تحتاج إلى ملء العلامات
            المتوقعة لحساب الهدف.
          </p>
        ) : result.required > 100 ? (
          <p className="mt-3 text-sm text-red-800">
            لا يمكن بلوغ هذا الهدف في الفصل الحالي. أعلى تراكمي ممكن مع 100% في
            جميع المواد: <strong>{formatAverage(result.maximum)}</strong>.
          </p>
        ) : result.required <= 0 ? (
          <p className="mt-3 text-sm text-brand-800">
            الهدف متحقق حسابيًا حتى مع صفر في مواد هذا الفصل. هذا ليس توصية؛
            النجاح في المواد ومتطلبات الجامعة يبقيان ضروريين.
          </p>
        ) : (
          <p className="mt-3 text-brand-800">
            تحتاج معدلًا فصليًا موزونًا لا يقل عن{' '}
            <strong>
              {(Math.ceil(result.required * 100) / 100).toFixed(2)}%
            </strong>{' '}
            لتحقيق الهدف.
          </p>
        )}
        <p className="mt-3 text-xs leading-6 text-slate-400">
          المحاكاة تستبدل العلامة القديمة بالجديدة للمادة المعادة وبالساعات
          نفسها؛ يجب أن تكون العلامة القديمة داخلة بالفعل في المعدل السابق. لا
          تعالج الإعفاءات أو المعادلات أو اختلاف ساعات المادة. نعرض منزلتين
          للمحاكاة دون تقريب الحسابات الوسيطة؛ المعدل الرسمي تحدده الجامعة.
        </p>
        <a
          className="mt-2 inline-block text-sm text-brand-700 underline"
          href="https://onlineregistration.jpu.edu.jo/ershad/files/b.pdf"
          target="_blank"
          rel="noreferrer"
        >
          تعليمات منح البكالوريوس — جامعة جرش
        </a>
      </section>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-brand-50 p-3">
      <p className="text-xs text-slate-300">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand-800" dir="ltr">
        {value}
      </p>
    </div>
  );
}
const CourseEditor = memo(function CourseEditor({
  course: c,
  index,
  subjects,
  onChange,
  onRemove,
}: {
  course: EnrolledCourse;
  index: number;
  subjects: Subject[];
  onChange: (patch: Partial<EnrolledCourse>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">المادة {index + 1}</h3>
        <button
          className="rounded-lg p-2 text-red-700 hover:bg-red-50"
          aria-label={`حذف المادة ${index + 1}`}
          onClick={onRemove}
        >
          <Icon name="Trash2" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 space-y-1 text-sm">
          اسم المادة
          <input
            className="input"
            maxLength={160}
            list="assistant-subjects"
            value={c.name}
            onChange={(e) =>
              onChange({
                name: e.target.value,
                subjectId: matchSubject(e.target.value, subjects),
              })
            }
            placeholder="ابحث عن مادة أو اكتب اسمًا خاصًا"
          />
        </label>
        <label className="space-y-1 text-sm">
          الساعات
          <input
            className="input"
            type="number"
            min="1"
            max="12"
            step="0.5"
            value={c.hours}
            onChange={(e) => onChange({ hours: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          العلامة المتوقعة
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={c.grade}
            onChange={(e) => onChange({ grade: e.target.value })}
            placeholder="من 100"
          />
        </label>
      </div>
      <label className="mt-3 block space-y-1 text-xs text-slate-400">
        ربط بمكتبة الموقع (اختياري؛ اختر المادة الصحيحة عند تشابه الأسماء)
        <select
          className="input"
          value={c.subjectId ?? ''}
          onChange={(e) => onChange({ subjectId: e.target.value || null })}
        >
          <option value="">مادة خاصة / غير مرتبطة</option>
          {subjects.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name} {s.code ? `(${s.code})` : ''} · {s.major}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={c.retake}
          onChange={(e) => onChange({ retake: e.target.checked })}
        />{' '}
        مادة معادة (ساعاتها موجودة ضمن الساعات السابقة)
      </label>
      {c.retake && (
        <label className="block max-w-xs space-y-1 text-sm">
          العلامة القديمة
          <input
            className="input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={c.oldGrade}
            onChange={(e) => onChange({ oldGrade: e.target.value })}
          />
        </label>
      )}
    </div>
  );
});
