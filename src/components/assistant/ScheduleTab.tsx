import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  buildSemesterCalendar,
  campusTimestamp,
  countdown,
  dailyMeetings,
  scheduleConflicts,
  scheduleErrors,
  WEEK_DAYS,
} from '@/lib/scheduleUtils';
import { downloadBlob } from '@/lib/downloadBlob';
import type { EnrolledCourse, StudentSemester } from '@/lib/studentAssistant';

const courseColors = [
  'border-brand-300 bg-brand-50 text-brand-900',
  'border-teal-300 bg-teal-50 text-teal-900',
  'border-violet-300 bg-violet-50 text-violet-900',
  'border-amber-300 bg-amber-50 text-amber-900',
  'border-rose-300 bg-rose-50 text-rose-900',
  'border-cyan-300 bg-cyan-50 text-cyan-900',
];

export function WeeklySchedule({
  courses,
  compact = false,
}: {
  courses: EnrolledCourse[];
  compact?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 ${compact ? 'sm:grid-cols-4' : 'lg:grid-cols-4'}`}
    >
      {WEEK_DAYS.map((day, index) => {
        const entries = dailyMeetings(courses, index);
        let latestEnd = 0;
        return (
          <section
            key={day}
            className="min-w-0 rounded-xl border border-ink-600 bg-white p-3"
          >
            <h3 className="mb-3 font-bold text-brand-800">{day}</h3>
            {!entries.length && (
              <p className="text-xs text-slate-400">لا توجد محاضرات</p>
            )}
            {entries.map(({ course, meeting, color, start, end }) => {
              const gap =
                latestEnd > 0 && start > latestEnd ? start - latestEnd : 0;
              const overlap = latestEnd > start;
              latestEnd = Math.max(latestEnd, end);
              return (
                <div key={`${course.id}-${meeting.id}`}>
                  {gap > 0 && (
                    <p className="my-2 text-center text-xs text-slate-400">
                      استراحة {gap} دقيقة
                    </p>
                  )}
                  <div
                    className={`mb-2 rounded-lg border-r-4 p-2 ${courseColors[color % courseColors.length]} ${overlap ? 'ring-2 ring-red-500' : ''}`}
                  >
                    <p className="break-words text-sm font-bold">
                      {course.name || 'مادة بدون اسم'}
                    </p>
                    <p className="mt-1 text-xs" dir="ltr">
                      {meeting.start} – {meeting.end}
                    </p>
                    {overlap && (
                      <p className="mt-1 text-xs font-bold text-red-800">
                        تعارض زمني
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

export function ScheduleTab({
  data,
  onChange,
}: {
  data: StudentSemester;
  onChange: (data: StudentSemester) => void;
}) {
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const conflicts = scheduleConflicts(data.courses);
  const errors = scheduleErrors(data);
  const deadlines = data.courses
    .flatMap((c) => c.deadlines.map((d) => ({ ...d, courseName: c.name })))
    .sort(
      (a, b) =>
        (campusTimestamp(a.at) ?? Infinity) -
        (campusTimestamp(b.at) ?? Infinity),
    );
  function changeCourse(id: string, patch: Partial<EnrolledCourse>) {
    onChange({
      ...data,
      courses: data.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }
  function exportCalendar() {
    try {
      downloadBlob(
        new Blob([buildSemesterCalendar(data)], {
          type: 'text/calendar;charset=utf-8',
        }),
        'jpu-semester.ics',
      );
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تصدير التقويم.');
    }
  }
  return (
    <div className="space-y-5">
      <section className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">جدول الفصل</h2>
          <button className="btn-ghost" onClick={exportCalendar}>
            <Icon name="Download" className="h-4 w-4" /> تصدير التقويم .ics
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          جميع الأوقات بتوقيت عمّان (UTC+03). المحاضرات تتكرر أسبوعيًا بين
          تاريخي الفصل. لا نرسل إشعارات منبثقة؛ العدادات داخل هذه الصفحة فقط.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            بداية الفصل
            <input
              className="input"
              type="date"
              value={data.startsOn}
              onInput={(e) =>
                onChange({ ...data, startsOn: e.currentTarget.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            نهاية الفصل
            <input
              className="input"
              type="date"
              min={data.startsOn}
              value={data.endsOn}
              onInput={(e) =>
                onChange({ ...data, endsOn: e.currentTarget.value })
              }
            />
          </label>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          استورد الملف من إعدادات التقويم. المواعيد تظهر كنقاط زمنية وليست مدد
          امتحانات؛ العطل غير مستثناة تلقائيًا.
        </p>
      </section>
      {conflicts.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p className="font-bold">توجد تعارضات في الجدول</p>
          <ul className="mt-2 list-inside list-disc">
            {conflicts.map((c, i) => (
              <li key={i}>
                {WEEK_DAYS[c.day]}: {c.first.course.name || 'مادة'} مع{' '}
                {c.second.course.name || 'مادة'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <WeeklySchedule courses={data.courses} />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">المواعيد القادمة</h2>
        {!deadlines.length && (
          <p className="text-sm text-slate-400">
            أضف موعد الميد أو الفاينل أو المشروع من المادة أدناه.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {deadlines.map((d) => {
            const at = campusTimestamp(d.at);
            const soon = at !== null && at > now && at - now < 48 * 3_600_000;
            return (
              <div
                key={d.id}
                className={`card p-4 ${soon ? 'border-amber-300 bg-amber-50' : ''}`}
              >
                <p className="font-bold">
                  {d.courseName || 'مادة'} —{' '}
                  {d.title ||
                    { midterm: 'ميد', final: 'فاينل', project: 'مشروع' }[
                      d.kind
                    ]}
                </p>
                <p className="mt-1 text-xs text-slate-400" dir="ltr">
                  {d.at.replace('T', ' ')}
                </p>
                <p
                  className={`mt-2 text-sm ${soon ? 'text-amber-800' : 'text-brand-800'}`}
                >
                  {countdown(d.at, now)}
                </p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">أوقات المواد</h2>
        {!data.courses.length && (
          <p className="card p-6 text-sm text-slate-400">
            أضف موادك أولًا من تبويب الحاسبة.
          </p>
        )}
        {data.courses.map((c) => (
          <details key={c.id} className="card p-4">
            <summary className="cursor-pointer font-bold">
              {c.name || 'مادة بدون اسم'}{' '}
              <span className="text-xs font-normal text-slate-400">
                · {c.meetings.length} شعبة · {c.deadlines.length} موعد
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              {c.meetings.map((m, index) => (
                <fieldset
                  key={m.id}
                  className="rounded-xl border border-ink-600 p-3"
                >
                  <legend className="px-2 text-sm">المحاضرة {index + 1}</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((d, day) => (
                      <label
                        key={d}
                        className={`flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs ${m.days.includes(day) ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-ink-600'}`}
                      >
                        <input
                          type="checkbox"
                          checked={m.days.includes(day)}
                          onChange={(e) =>
                            changeCourse(c.id, {
                              meetings: c.meetings.map((x) =>
                                x.id === m.id
                                  ? {
                                      ...x,
                                      days: e.target.checked
                                        ? [...x.days, day].sort()
                                        : x.days.filter((n) => n !== day),
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-sm">
                      من
                      <input
                        className="input"
                        type="time"
                        value={m.start}
                        onInput={(e) => {
                          const value = e.currentTarget.value;
                          changeCourse(c.id, {
                            meetings: c.meetings.map((x) =>
                              x.id === m.id ? { ...x, start: value } : x,
                            ),
                          });
                        }}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      إلى
                      <input
                        className="input"
                        type="time"
                        value={m.end}
                        onInput={(e) => {
                          const value = e.currentTarget.value;
                          changeCourse(c.id, {
                            meetings: c.meetings.map((x) =>
                              x.id === m.id ? { ...x, end: value } : x,
                            ),
                          });
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className="mt-2 min-h-11 text-sm text-red-700"
                    onClick={() =>
                      changeCourse(c.id, {
                        meetings: c.meetings.filter((x) => x.id !== m.id),
                      })
                    }
                  >
                    حذف المحاضرة
                  </button>
                </fieldset>
              ))}
              <button
                className="btn-ghost"
                disabled={c.meetings.length >= 10}
                onClick={() =>
                  changeCourse(c.id, {
                    meetings: [
                      ...c.meetings,
                      { id: crypto.randomUUID(), days: [], start: '', end: '' },
                    ],
                  })
                }
              >
                <Icon name="Plus" className="h-4 w-4" /> إضافة وقت محاضرة
              </button>
              {c.deadlines.map((d) => (
                <fieldset
                  key={d.id}
                  className="rounded-xl border border-ink-600 p-3"
                >
                  <legend className="px-2 text-sm">موعد اختبار أو تسليم</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      النوع
                      <select
                        className="input"
                        value={d.kind}
                        onChange={(e) =>
                          changeCourse(c.id, {
                            deadlines: c.deadlines.map((x) =>
                              x.id === d.id
                                ? {
                                    ...x,
                                    kind: e.target.value as typeof d.kind,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="midterm">ميد</option>
                        <option value="final">فاينل</option>
                        <option value="project">تسليم مشروع</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      العنوان (اختياري)
                      <input
                        className="input"
                        value={d.title}
                        maxLength={160}
                        onChange={(e) =>
                          changeCourse(c.id, {
                            deadlines: c.deadlines.map((x) =>
                              x.id === d.id
                                ? { ...x, title: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      التاريخ والوقت — عمّان
                      <input
                        className="input"
                        type="datetime-local"
                        value={d.at}
                        onInput={(e) => {
                          const value = e.currentTarget.value;
                          changeCourse(c.id, {
                            deadlines: c.deadlines.map((x) =>
                              x.id === d.id ? { ...x, at: value } : x,
                            ),
                          });
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className="mt-2 min-h-11 text-sm text-red-700"
                    onClick={() =>
                      changeCourse(c.id, {
                        deadlines: c.deadlines.filter((x) => x.id !== d.id),
                      })
                    }
                  >
                    حذف الموعد
                  </button>
                </fieldset>
              ))}
              <button
                className="btn-ghost"
                disabled={c.deadlines.length >= 20}
                onClick={() =>
                  changeCourse(c.id, {
                    deadlines: [
                      ...c.deadlines,
                      {
                        id: crypto.randomUUID(),
                        kind: 'midterm',
                        title: '',
                        at: '',
                      },
                    ],
                  })
                }
              >
                <Icon name="Plus" className="h-4 w-4" /> إضافة موعد
              </button>
            </div>
          </details>
        ))}
      </section>
      {errors.length > 0 && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
        >
          هناك {errors.length} موعد غير مكتمل. لن يدخل في الجدول، ويجب إكماله أو
          حذفه قبل تصدير التقويم.
        </p>
      )}
    </div>
  );
}
