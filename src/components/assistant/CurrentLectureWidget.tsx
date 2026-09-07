import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import {
  arabicDuration,
  lectureSnapshot,
  minutesUntil,
  validMeeting,
} from '@/lib/lectureSchedule';
import type {
  EnrolledCourse,
  Meeting,
  StudentSemester,
} from '@/lib/studentAssistant';

const days = [
  [0, 'الأحد'],
  [1, 'الاثنين'],
  [2, 'الثلاثاء'],
  [3, 'الأربعاء'],
  [4, 'الخميس'],
  [5, 'الجمعة'],
  [6, 'السبت'],
] as const;

const dayName = new Intl.DateTimeFormat('ar-JO', { weekday: 'long' });
const time = new Intl.DateTimeFormat('ar-JO', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const today = new Intl.DateTimeFormat('ar-JO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function firstMeeting(course: EnrolledCourse) {
  return course.meetings[0];
}

export function CurrentLectureWidget({
  data,
  onChange,
}: {
  data: StudentSemester;
  onChange: (data: StudentSemester) => void;
}) {
  const configured = data.courses.some((course) =>
    course.meetings.some(validMeeting),
  );
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const delay = 60_000 - (Date.now() % 60_000) + 25;
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [now]);
  const snapshot = useMemo(
    () => lectureSnapshot(data.courses, now),
    [data.courses, now],
  );
  const active = snapshot.current;
  const updateMeeting = (courseId: string, patch: Partial<Meeting>) => {
    onChange({
      ...data,
      courses: data.courses.map((course) => {
        if (course.id !== courseId) return course;
        const current = firstMeeting(course) ?? {
          id: crypto.randomUUID(),
          days: [],
          start: '',
          end: '',
          building: '',
          room: '',
        };
        return {
          ...course,
          meetings: [{ ...current, ...patch }, ...course.meetings.slice(1)],
        };
      }),
    });
  };
  return (
    <section className="assistant-now" aria-labelledby="assistant-now-title">
      <div className="assistant-now-heading">
        <div>
          <p className="assistant-eyebrow">
            <span /> الآن في جدولك
          </p>
          <h2 id="assistant-now-title">محاضرات اليوم</h2>
        </div>
        <div className="assistant-now-actions">
          <span className="assistant-today-label">
            <Icon name="Clock" /> {today.format(now)}
          </span>
          {data.courses.length > 0 && (
            <button
              className="assistant-schedule-edit"
              type="button"
              onClick={() => setEditing((value) => !value)}
              aria-expanded={editing}
              aria-controls="assistant-schedule-editor"
            >
              <Icon name={editing ? 'X' : 'Pencil'} />
              {editing
                ? 'إغلاق'
                : configured
                  ? 'تعديل الجدول'
                  : 'إعداد الجدول'}
            </button>
          )}
        </div>
      </div>

      {active ? (
        <div className="assistant-now-card">
          <div className="assistant-now-content">
            <span className="assistant-live">
              <i /> جارية الآن
            </span>
            <h3>{active.course.name || 'مادة بدون اسم'}</h3>
            <div className="assistant-now-details">
              <span>
                <Icon name="Clock" /> {active.meeting.start} —{' '}
                {active.meeting.end}
              </span>
              {(active.meeting.building || active.meeting.room) && (
                <span>
                  <Icon name="Home" />{' '}
                  {[
                    active.meeting.building,
                    active.meeting.room && `قاعة ${active.meeting.room}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </div>
            <div className="assistant-ends">
              <span>الوقت المتبقي</span>
              <strong>{arabicDuration(snapshot.minutesLeft!)}</strong>
            </div>
          </div>
          <span className="assistant-now-symbol">
            <Icon name="BookOpen" />
            <small>المحاضرة</small>
          </span>
          <div className="assistant-progress-wrap">
            <div
              className="assistant-progress"
              aria-label={`انقضى ${Math.round(snapshot.progress)} بالمئة من المحاضرة`}
            >
              <span
                style={
                  {
                    '--lecture-progress': snapshot.progress / 100,
                    '--lecture-duration': `${Math.max(1, active.end.getTime() - now.getTime())}ms`,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="assistant-no-lecture">
          <span className="assistant-no-lecture-icon">
            <Icon name="Clock" />
            <i aria-hidden="true" />
          </span>
          <div>
            <h3>
              {configured
                ? 'لا توجد محاضرة الآن'
                : data.courses.length
                  ? 'أضف أوقات محاضراتك'
                  : 'أضف مواد فصلك أولًا'}
            </h3>
            <p>
              {snapshot.next
                ? `محاضرتك القادمة «${snapshot.next.course.name}» ${snapshot.next.start.toDateString() === now.toDateString() ? `بعد ${arabicDuration(minutesUntil(snapshot.next.start, now))}` : `${dayName.format(snapshot.next.start)} الساعة ${time.format(snapshot.next.start)}`}`
                : data.courses.length
                  ? 'اضغط إعداد الجدول وأدخل الأيام والأوقات مرة واحدة.'
                  : 'ستظهر هنا المحاضرة الحالية بمجرد إضافة المواد وجدولها.'}
            </p>
          </div>
        </div>
      )}

      {snapshot.today.length > 0 && (
        <div className="assistant-day-strip" aria-label="مواد اليوم">
          {snapshot.today.map((item) => {
            const state =
              now >= item.end ? 'done' : now >= item.start ? 'current' : 'next';
            return (
              <article
                key={`${item.course.id}-${item.meeting.id}`}
                className={`assistant-day-course is-${state}`}
              >
                <span className="assistant-day-state">
                  {state === 'done'
                    ? 'انتهت'
                    : state === 'current'
                      ? 'جارية الآن'
                      : 'قادمة'}
                </span>
                <h3>{item.course.name || 'مادة بدون اسم'}</h3>
                <p>
                  <Icon name="Clock" /> {item.meeting.start}
                </p>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          id="assistant-schedule-editor"
          className="assistant-schedule-editor"
        >
          <div className="assistant-schedule-editor-intro">
            <h3>رتّب جدولك مرة واحدة</h3>
            <p>اختر أيام كل مادة ووقتها ومكانها. تُحفظ البيانات على جهازك.</p>
          </div>
          <div className="assistant-schedule-list">
            {data.courses.map((course) => {
              const meeting = firstMeeting(course) ?? {
                id: '',
                days: [],
                start: '',
                end: '',
                building: '',
                room: '',
              };
              return (
                <details className="assistant-schedule-course" key={course.id}>
                  <summary>
                    <span>
                      <strong>{course.name || 'مادة بدون اسم'}</strong>
                      <small>
                        {validMeeting(meeting)
                          ? `${meeting.days.length} أيام · ${meeting.start} — ${meeting.end}`
                          : 'لم يكتمل موعدها'}
                      </small>
                    </span>
                    <Icon name="ChevronDown" />
                  </summary>
                  <div className="assistant-schedule-course-body">
                    <fieldset>
                      <legend>أيام المحاضرة</legend>
                      <div className="assistant-day-options">
                        {days.map(([value, label]) => (
                          <label key={value}>
                            <input
                              type="checkbox"
                              checked={meeting.days.includes(value)}
                              onChange={() =>
                                updateMeeting(course.id, {
                                  days: meeting.days.includes(value)
                                    ? meeting.days.filter(
                                        (day) => day !== value,
                                      )
                                    : [...meeting.days, value].sort(),
                                })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="assistant-schedule-fields">
                      <label className="assistant-field">
                        تبدأ
                        <input
                          className="input"
                          type="time"
                          value={meeting.start}
                          onChange={(event) =>
                            updateMeeting(course.id, {
                              start: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="assistant-field">
                        تنتهي
                        <input
                          className="input"
                          type="time"
                          value={meeting.end}
                          onChange={(event) =>
                            updateMeeting(course.id, {
                              end: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="assistant-field">
                        المبنى
                        <input
                          className="input"
                          maxLength={100}
                          value={meeting.building ?? ''}
                          onChange={(event) =>
                            updateMeeting(course.id, {
                              building: event.target.value,
                            })
                          }
                          placeholder="مثلاً: مبنى الحاسوب"
                        />
                      </label>
                      <label className="assistant-field">
                        رقم القاعة
                        <input
                          className="input"
                          maxLength={100}
                          value={meeting.room ?? ''}
                          onChange={(event) =>
                            updateMeeting(course.id, {
                              room: event.target.value,
                            })
                          }
                          placeholder="مثلاً: 713"
                        />
                      </label>
                    </div>
                    {meeting.start &&
                      meeting.end &&
                      meeting.end <= meeting.start && (
                        <p role="alert" className="assistant-schedule-error">
                          وقت الانتهاء يجب أن يكون بعد وقت البداية.
                        </p>
                      )}
                  </div>
                </details>
              );
            })}
          </div>
          <button
            type="button"
            className="assistant-button assistant-schedule-save"
            onClick={() => setEditing(false)}
          >
            <Icon name="Check" /> حفظ وإخفاء الإعداد
          </button>
        </div>
      )}
    </section>
  );
}
