import { memo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { SemesterSummaryCard } from './SemesterSummaryCard';
import { calculateGpa, classifyAverage, numeric } from '@/lib/gpaEngine';
import {
  MAX_COURSES,
  newCourse,
  type EnrolledCourse,
  type StudentSemester,
} from '@/lib/studentAssistant';
import { matchSubject } from '@/lib/assistantSubjects';
import type { Subject } from '@/lib/types';

const formatAverage = (value: number | null) =>
  value === null ? '—' : value.toFixed(2) + '%';
interface Props {
  data: StudentSemester;
  onChange: (data: StudentSemester) => void;
  subjects: Subject[];
}

export function GPACalculatorTab({ data, onChange, subjects }: Props) {
  const [showCard, setShowCard] = useState(false);
  const result = calculateGpa(data);
  const rating =
    result.cumulative === null ? null : classifyAverage(result.cumulative);
  const completed = data.courses.filter(
    (course) => numeric(course.grade, 0, 100) !== null,
  ).length;
  function changeCourse(id: string, patch: Partial<EnrolledCourse>) {
    onChange({
      ...data,
      courses: data.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }
  return (
    <div className="assistant-calculator-layout">
      <div className="assistant-editor-column">
        <section
          className="assistant-surface assistant-base"
          aria-labelledby="gpa-base"
        >
          <div className="assistant-section-heading">
            <span className="assistant-step" aria-hidden="true">
              01
            </span>
            <div>
              <h2 id="gpa-base">قبل هذا الفصل</h2>
              <p>نقطة البداية لحساب التراكمي الجديد.</p>
            </div>
          </div>
          <div className="assistant-base-fields">
            <label className="assistant-field">
              الساعات السابقة المحتسبة
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                max="400"
                step="0.5"
                value={data.previousHours}
                onChange={(e) =>
                  onChange({ ...data, previousHours: e.target.value })
                }
              />
            </label>
            <label className="assistant-field">
              المعدل التراكمي السابق (%)
              <input
                className="input"
                type="number"
                inputMode="decimal"
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
          <p className="assistant-note">
            استخدم الساعات الداخلة في المعدل، بما فيها المعادة، وليس ساعات
            النجاح فقط. إذا كان هذا أول فصل لك، اترك الساعات صفرًا.
          </p>
        </section>
        <section
          aria-labelledby="semester-courses"
          className="assistant-surface assistant-courses"
        >
          <div className="assistant-section-heading assistant-courses-heading">
            <span className="assistant-step" aria-hidden="true">
              02
            </span>
            <div>
              <h2 id="semester-courses">
                مواد هذا الفصل{' '}
                <span className="assistant-count">{data.courses.length}</span>
              </h2>
              <p>الاسم، الساعات، والعلامة التي تتوقعها.</p>
            </div>
            <button
              className="assistant-button assistant-add"
              disabled={data.courses.length >= MAX_COURSES}
              onClick={() =>
                onChange({ ...data, courses: [...data.courses, newCourse()] })
              }
            >
              <Icon name="Plus" /> أضف مادة
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
            <div className="assistant-empty">
              <span className="assistant-empty-icon">
                <Icon name="BookOpen" />
              </span>
              <h3>لنبدأ بأول مادة</h3>
              <p>
                أضف موادك من الزر أعلاه. ستظهر هنا، وفي مكتبة فصلك وبطاقة
                المعدل.
              </p>
            </div>
          )}
          <div className="assistant-course-list">
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
                      'حذف «' +
                        (c.name || 'هذه المادة') +
                        '» من مساعدك المحلي؟ لا يحذف ذلك شيئًا من مكتبة الموقع.',
                    )
                  )
                    onChange({
                      ...data,
                      courses: data.courses.filter((x) => x.id !== c.id),
                    });
                }}
              />
            ))}
          </div>
          {data.courses.length > 0 && (
            <div className="assistant-course-footer">
              <span>
                {completed} من {data.courses.length} علامات مكتملة
              </span>
              <a href="#gpa-result">
                عرض النتيجة <Icon name="ArrowLeft" />
              </a>
            </div>
          )}
          {data.courses.length >= MAX_COURSES && (
            <p className="assistant-note px-5 pb-4">
              وصلت للحد الأقصى: {MAX_COURSES} مادة.
            </p>
          )}
        </section>
        {result.errors.length > 0 && (
          <div role="alert" className="assistant-warning">
            <Icon name="AlertCircle" />
            <ul>
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="assistant-results-column">
        <section className="assistant-result" aria-labelledby="gpa-result">
          <div className="assistant-result-topline">
            <h2 id="gpa-result">توقعات الفصل</h2>
            <span>
              <span /> محاكاة مباشرة
            </span>
          </div>
          <div className="assistant-average">
            <p>التراكمي المتوقع</p>
            <div className="assistant-average-value" dir="ltr">
              {result.cumulative === null ? (
                '—'
              ) : (
                <>
                  {result.cumulative.toFixed(2)}
                  <span>%</span>
                </>
              )}
            </div>
            <span className="assistant-result-rating">
              {rating
                ? rating.label
                : data.courses.length
                  ? 'بانتظار اكتمال البيانات'
                  : 'أضف موادك لتبدأ المحاكاة'}
            </span>
          </div>
          <dl className="assistant-metrics">
            <div>
              <dt>المعدل الفصلي</dt>
              <dd dir="ltr">{formatAverage(result.semester)}</dd>
            </div>
            <div>
              <dt>ساعات الفصل</dt>
              <dd>{result.semesterHours}</dd>
            </div>
            <div>
              <dt>الساعات بعد الفصل</dt>
              <dd>{result.totalHours}</dd>
            </div>
          </dl>
          {!result.gradesComplete && (
            <p className="assistant-result-note">
              أكمل العلامات المتوقعة لإظهار المعدل. العلامة الفارغة لا تُحسب
              صفرًا.
            </p>
          )}
          {result.cumulative !== null && result.cumulative < 60 && (
            <p className="assistant-result-caution">
              المعدل المتوقع أقل من 60% وقد يعرّضك للإنذار الأكاديمي. راجع
              مرشدك؛ الإنذار الفعلي تحكمه تعليمات الجامعة وحالتك الدراسية.
            </p>
          )}
          <div className="assistant-card-action">
            <button
              className="assistant-button assistant-button-white"
              type="button"
              aria-expanded={showCard}
              aria-controls="gpa-semester-card"
              onClick={() => setShowCard((value) => !value)}
            >
              <Icon name="Download" />
              {showCard ? 'إخفاء بطاقة الفصل' : 'طباعة / حفظ بطاقة الفصل'}
              <Icon name="ChevronDown" />
            </button>
            <p>بطاقة واحدة للمواد والمعدل، تحتفظ فيها لنفسك.</p>
          </div>
          {showCard && (
            <div id="gpa-semester-card" className="assistant-card-export">
              <SemesterSummaryCard data={data} onChange={onChange} />
            </div>
          )}
        </section>
        <details className="assistant-surface assistant-target">
          <summary>
            <span className="assistant-target-icon">
              <Icon name="Target" />
            </span>
            <span>
              <span className="assistant-disclosure-title">
                خطّط لمعدلك المستهدف
              </span>
              <span className="assistant-disclosure-hint">
                ما العلامات التي أحتاجها لهدفي؟
              </span>
            </span>
            <Icon name="ChevronDown" />
          </summary>
          <div className="assistant-target-body">
            <label className="assistant-field">
              التراكمي المستهدف (%)
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={data.target}
                onChange={(e) => onChange({ ...data, target: e.target.value })}
              />
            </label>
            {result.targetInvalid && (
              <p role="alert" className="assistant-target-error">
                الهدف يجب أن يكون بين 0 و100.
              </p>
            )}
            {result.required === null ? (
              <p>
                أدخل الهدف والساعات وبيانات الإعادة؛ لا تحتاج إلى ملء العلامات
                المتوقعة لحساب الهدف.
              </p>
            ) : result.required > 100 ? (
              <p className="assistant-target-error">
                لا يمكن بلوغ هذا الهدف في الفصل الحالي. أعلى تراكمي ممكن مع 100%
                في جميع المواد: <strong>{formatAverage(result.maximum)}</strong>
                .
              </p>
            ) : result.required <= 0 ? (
              <p>
                الهدف متحقق حسابيًا حتى مع صفر في مواد هذا الفصل. هذا ليس توصية؛
                النجاح في المواد ومتطلبات الجامعة يبقيان ضروريين.
              </p>
            ) : (
              <p>
                تحتاج معدلًا فصليًا موزونًا لا يقل عن{' '}
                <strong className="assistant-target-value">
                  {(Math.ceil(result.required * 100) / 100).toFixed(2)}%
                </strong>{' '}
                لتحقيق الهدف.
              </p>
            )}
          </div>
        </details>
        <details className="assistant-method">
          <summary>
            <Icon name="Info" /> كيف تُحسب هذه المحاكاة؟
            <Icon name="ChevronDown" />
          </summary>
          <p>
            المحاكاة تستبدل العلامة القديمة بالجديدة للمادة المعادة وبالساعات
            نفسها؛ يجب أن تكون العلامة القديمة داخلة بالفعل في المعدل السابق. لا
            تعالج الإعفاءات أو المعادلات أو اختلاف ساعات المادة. نعرض منزلتين
            للمحاكاة دون تقريب الحسابات الوسيطة؛ المعدل الرسمي تحدده الجامعة.
          </p>
          <a
            href="https://onlineregistration.jpu.edu.jo/ershad/files/b.pdf"
            target="_blank"
            rel="noreferrer"
          >
            تعليمات منح البكالوريوس — جامعة جرش <Icon name="ExternalLink" />
          </a>
        </details>
      </div>
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
  const [optionsOpen, setOptionsOpen] = useState(c.retake);
  const linked = subjects.find((s) => s.id === c.subjectId);
  return (
    <article
      className="assistant-course-editor"
      aria-label={'المادة ' + (index + 1)}
    >
      <div className="assistant-course-identity">
        <span className="assistant-course-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h3>المادة {index + 1}</h3>
        <span
          className={'assistant-link-status ' + (linked ? 'is-linked' : '')}
        >
          <Icon name={linked ? 'BookMarked' : 'Pencil'} />
          {linked ? 'مرتبطة بالمكتبة' : 'مادة خاصة'}
          {c.retake ? ' · معادة' : ''}
        </span>
        <button
          className="assistant-remove"
          type="button"
          aria-label={'حذف المادة ' + (index + 1)}
          onClick={onRemove}
        >
          <Icon name="Trash2" />
        </button>
      </div>
      <div className="assistant-course-fields">
        <label className="assistant-field assistant-course-name">
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
            placeholder="ابحث عن مادة أو اكتب اسمها"
          />
        </label>
        <label className="assistant-field">
          الساعات
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="1"
            max="12"
            step="0.5"
            value={c.hours}
            onChange={(e) => onChange({ hours: e.target.value })}
          />
        </label>
        <label className="assistant-field">
          العلامة المتوقعة
          <input
            className="input assistant-grade-input"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={c.grade}
            onChange={(e) => onChange({ grade: e.target.value })}
            placeholder="من 100"
          />
        </label>
      </div>
      <button
        className="assistant-options-toggle"
        type="button"
        aria-expanded={optionsOpen}
        aria-controls={'course-options-' + c.id}
        onClick={() => setOptionsOpen((value) => !value)}
      >
        <Icon name="Settings" /> الربط بالمكتبة وإعادة المادة{' '}
        <Icon name="ChevronDown" />
      </button>
      {optionsOpen && (
        <div className="assistant-course-options" id={'course-options-' + c.id}>
          <label className="assistant-field">
            ربط بمكتبة الموقع (اختياري؛ اختر المادة الصحيحة عند تشابه الأسماء)
            <select
              className="input"
              value={c.subjectId ?? ''}
              onChange={(e) => onChange({ subjectId: e.target.value || null })}
            >
              <option value="">مادة خاصة / غير مرتبطة</option>
              {subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name} {s.code ? '(' + s.code + ')' : ''} · {s.major}
                </option>
              ))}
            </select>
          </label>
          <label className="assistant-retake">
            <input
              type="checkbox"
              checked={c.retake}
              onChange={(e) => onChange({ retake: e.target.checked })}
            />
            مادة معادة (ساعاتها موجودة ضمن الساعات السابقة)
          </label>
          {c.retake && (
            <label className="assistant-field assistant-old-grade">
              العلامة القديمة
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={c.oldGrade}
                onChange={(e) => onChange({ oldGrade: e.target.value })}
              />
            </label>
          )}
        </div>
      )}
    </article>
  );
});
