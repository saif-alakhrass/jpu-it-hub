import { DEGREE_HOURS, planFutureGpa } from '@/lib/futureGpa';
import type { StudentSemester } from '@/lib/studentAssistant';

const defaults = { semesterHours: '15', average: '90' };
const percent = (value: number) => `${value.toFixed(2)}%`;

export function FutureGpaPlanner({
  data,
  onChange,
}: {
  data: StudentSemester;
  onChange: (data: StudentSemester) => void;
}) {
  const plan = data.futurePlan ?? defaults;
  const result = planFutureGpa({ ...data, ...plan });
  const fields = [
    {
      key: 'semesterHours',
      label: 'ساعات كل فصل قادم',
      min: 1,
      max: 30,
      step: '0.5',
    },
    {
      key: 'average',
      label: 'المعدل المتوقع لكل فصل (%)',
      min: 0,
      max: 100,
      step: '0.01',
    },
  ] as const;
  return (
    <section
      className="assistant-future-plan"
      aria-labelledby="future-gpa-title"
    >
      <header>
        <span className="assistant-future-badge">
          خطة التخصص · {DEGREE_HOURS} ساعة
        </span>
        <h3 id="future-gpa-title">كم فصل أحتاج للوصول لهدفي؟</h3>
        <p>
          نستخدم الهدف أعلاه ومعدلك وساعاتك «قبل هذا الفصل». مواد الحاسبة
          الحالية لا تُضاف هنا؛ هذا سيناريو مستقل يشمل هذا الفصل وما بعده.
        </p>
      </header>
      <div className="assistant-future-fields">
        {fields.map((field) => (
          <label className="assistant-field" key={field.key}>
            {field.label}
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={field.min}
              max={field.max}
              step={field.step}
              value={plan[field.key]}
              onChange={(e) =>
                onChange({
                  ...data,
                  futurePlan: { ...plan, [field.key]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </div>
      <p className="assistant-note">
        ساعات الفصل تقدير تختاره وليست موافقة على عبء التسجيل.
      </p>
      <div
        className="assistant-future-result"
        aria-live="polite"
        aria-atomic="true"
      >
        {result.status === 'invalid' ? (
          <p>{result.message}</p>
        ) : (
          <>
            {result.status === 'achieved' && (
              <p>
                <strong>
                  هدفك متحقق حاليًا — لا تحتاج فصولًا إضافية للوصول إليه.
                </strong>{' '}
                توقع التخرج أدناه يوضح إن كان المعدل المفترض يحافظ عليه.
              </p>
            )}
            {result.status === 'impossible' && (
              <p className="assistant-target-error">
                <strong>
                  هذا الهدف غير ممكن ضمن الساعات المتبقية، دون إعادة مواد.
                </strong>{' '}
                حتى مع 100% في كل الساعات المتبقية، أعلى تراكمي عند إكمال الخطة
                هو {percent(result.maximum)}.
              </p>
            )}
            {result.status === 'insufficient' && (
              <p>
                <strong>
                  الهدف ممكن حسابيًا، لكن ليس بمعدل {plan.average}% لكل فصل.
                </strong>{' '}
                بهذه الفرضية تصل إلى {percent(result.projected)} عند إكمال
                الخطة؛ زيادة عدد الفصول وحدها لا تكفي لأن الساعات المتبقية
                محدودة.
              </p>
            )}
            {result.status === 'reachable' && (
              <>
                <p className="assistant-future-headline">
                  تصل للهدف خلال <strong>{result.semesters}</strong>{' '}
                  {result.semesters === 1 ? 'فصل دراسي' : 'فصول دراسية'} تقريبًا
                </p>
                <p>
                  بمعدل موزون {plan.average}% في كل فصل، و{plan.semesterHours}{' '}
                  ساعة للفصل. بعد {result.added} ساعة إضافية يصبح التراكمي{' '}
                  {percent(result.reached)}.
                </p>
                {result.lastSemesterHours < Number(plan.semesterHours) && (
                  <p>
                    الفصل الأخير في هذا التقدير: {result.lastSemesterHours} ساعة
                    فقط، لإكمال الخطة.
                  </p>
                )}
              </>
            )}
            <dl className="assistant-future-metrics">
              <div>
                <dt>الساعات المتبقية</dt>
                <dd>{result.remaining}</dd>
              </div>
              <div>
                <dt>التراكمي عند إكمال الخطة بهذا السيناريو</dt>
                <dd dir="ltr">{percent(result.projected)}</dd>
              </div>
            </dl>
            {result.required !== null &&
              result.status !== 'achieved' &&
              result.status !== 'impossible' && (
                <p>
                  لبلوغ الهدف عند إكمال الخطة، تحتاج متوسطًا موزونًا لا يقل عن{' '}
                  <strong>
                    {percent(Math.ceil(result.required * 100) / 100)}
                  </strong>{' '}
                  على كامل الساعات المتبقية.
                </p>
              )}
          </>
        )}
      </div>
      <p className="assistant-note">
        تقدير رياضي، وليس وعدًا أو خطة تخرج رسمية. يفترض أن الساعات السابقة
        والمتبقية كلها تدخل في المعدل، وأن المواد القادمة جديدة؛ لا يشمل
        الإعفاءات أو إعادة مواد قديمة أو توفر المواد والمتطلبات السابقة. للإعادة
        استخدم حاسبة الفصل أعلاه.
      </p>
    </section>
  );
}
