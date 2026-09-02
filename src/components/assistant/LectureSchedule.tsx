import { Icon } from '@/components/Icon';
import { useMinuteNow } from '@/hooks/useMinuteNow';
import {
  lectureStatus,
  nearestDeadline,
  remainingTime,
} from '@/lib/studentAgenda';
import { nearestFixedHoliday } from '@/lib/fixedHolidays';
import { campusDate, WEEK_DAYS } from '@/lib/scheduleUtils';
import type { StudentSemester } from '@/lib/studentAssistant';

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00+03:00`).toLocaleDateString('ar-JO', {
    timeZone: 'Asia/Amman',
    month: 'long',
    day: 'numeric',
  });
}

/** A single clock updates the read-only cards, never the schedule editor. */
export function LectureSchedule({ data }: { data: StudentSemester }) {
  const now = useMinuteNow();
  const today = campusDate(now);
  const deadline = nearestDeadline(data, now);
  const holiday = nearestFixedHoliday(now);
  const meetings = data.courses.flatMap((course) =>
    course.meetings.map((meeting) => ({ course, meeting })),
  );

  return (
    <section className="space-y-4" aria-label="محاضراتي">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">محاضراتي</h2>
        <p className="text-xs text-slate-400">
          الحالة تتحدث تلقائيًا · توقيت عمّان
        </p>
      </div>
      {!meetings.length && (
        <p className="rounded-xl border border-dashed border-brand-200 p-5 text-sm text-slate-400">
          أضف أيام المحاضرة ووقتها وقاعتها من «أوقات المواد» أدناه.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {meetings.map(({ course, meeting }) => {
          const status = lectureStatus(meeting, data, now);
          const active = status.kind === 'active';
          const finished = status.kind === 'finished';
          const message =
            status.kind === 'active'
              ? `جارية الآن · تنتهي بعد ${remainingTime(status.endsAt - now)}`
              : status.kind === 'upcoming'
                ? `تبدأ بعد ${remainingTime(status.startsAt - now)}`
                : finished
                  ? 'انتهت اليوم'
                  : status.kind === 'invalid'
                    ? 'أكمل الأيام والوقت بشكل صحيح'
                    : 'لا توجد محاضرة قادمة ضمن تاريخ الفصل';
          return (
            <article
              key={`${course.id}-${meeting.id}`}
              aria-label={`محاضرة ${course.name || 'مادة بدون اسم'}`}
              className={`min-w-0 rounded-2xl border-2 border-r-8 p-5 sm:p-6 ${active ? 'border-emerald-500 bg-emerald-50' : finished ? 'border-slate-200 border-r-brand-200 bg-slate-50' : 'border-brand-100 border-r-brand-300 bg-white'}`}
            >
              <h3
                className={`break-words text-lg font-bold ${finished ? 'text-slate-300' : 'text-slate-100'}`}
              >
                {course.name || 'مادة بدون اسم'}
              </h3>
              <p className="mt-2 break-words text-sm text-slate-400">
                القاعة: <bdi>{meeting.room?.trim() || 'غير محددة'}</bdi>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white/70 px-3 py-3 text-sm text-slate-300">
                <span className="min-w-0 break-words">
                  {[...meeting.days]
                    .sort((a, b) => a - b)
                    .map((day) => WEEK_DAYS[day])
                    .join('، ') || 'حدّد الأيام'}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <Icon name="Clock" className="h-4 w-4" />
                  <bdi dir="ltr">
                    {meeting.start || '—'} – {meeting.end || '—'}
                  </bdi>
                </span>
              </div>
              <p
                className={`mt-3 flex min-h-12 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${active ? 'bg-emerald-100 text-emerald-800' : finished ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-800'}`}
              >
                <Icon
                  name={
                    finished
                      ? 'CheckCircle'
                      : status.kind === 'invalid'
                        ? 'AlertCircle'
                        : 'Clock'
                  }
                  className="h-4 w-4 shrink-0"
                />
                {message}
              </p>
            </article>
          );
        })}
      </div>
      <aside
        className="space-y-2 border-r-2 border-brand-200 pr-3 text-xs leading-6 text-slate-400"
        aria-label="تذكير المواعيد"
      >
        {deadline && (
          <p>
            أقرب موعد أدخلته: {deadline.course.name || 'مادة'} —{' '}
            {deadline.deadline.title ||
              { midterm: 'ميد', final: 'فاينل', project: 'تسليم مشروع' }[
                deadline.deadline.kind
              ]}{' '}
            ·{' '}
            {deadline.at === now
              ? 'الآن'
              : `بعد ${remainingTime(deadline.at - now)}`}
            {deadline.deadline.room?.trim() && (
              <>
                {' '}
                · القاعة: <bdi>{deadline.deadline.room}</bdi>
              </>
            )}
          </p>
        )}
        <p>
          {holiday.date === today ? 'اليوم مناسبة' : 'أقرب عطلة ثابتة:'}{' '}
          {holiday.title} · {dateLabel(holiday.date)}.{' '}
          {'note' in holiday ? holiday.note : ''} تأكد من إعلان الجامعة عن
          التعطيل؛ لا نلغي المحاضرات تلقائيًا.
        </p>
      </aside>
    </section>
  );
}
