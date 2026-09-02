import { useMinuteNow } from '@/hooks/useMinuteNow';
import {
  nearestDeadline,
  nearestLecture,
  remainingTime,
} from '@/lib/studentAgenda';
import { nearestFixedHoliday } from '@/lib/fixedHolidays';
import { campusDate, campusTimestamp } from '@/lib/scheduleUtils';
import type { StudentSemester } from '@/lib/studentAssistant';

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00+03:00`).toLocaleDateString('ar-JO', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
export function StudentAgenda({ data }: { data: StudentSemester }) {
  const now = useMinuteNow();
  const today = campusDate(now);
  const lecture = nearestLecture(data, now);
  const deadline = nearestDeadline(data, now);
  const holiday = nearestFixedHoliday(now);
  const holidayToday = holiday.date === today;
  return (
    <section className="mb-6 space-y-3" aria-label="الآن وأقرب المواعيد">
      <h2 className="text-lg font-bold">الآن والقادم</h2>
      <div className="grid gap-3 lg:grid-cols-3">
        <div
          className={`card p-4 ${lecture?.active ? 'border-brand-300 bg-brand-50' : ''}`}
        >
          <p className="text-xs font-bold text-brand-700">
            {lecture?.active ? 'محاضرتك الآن' : 'المحاضرة الأقرب'}
          </p>
          {lecture ? (
            <>
              <h3 className="mt-2 break-words font-bold">
                {lecture.course.name || 'مادة بدون اسم'}
              </h3>
              <p className="mt-2 text-sm text-brand-800">
                {lecture.active
                  ? `تنتهي بعد ${remainingTime(lecture.endsAt - now)}`
                  : `تبدأ بعد ${remainingTime(lecture.startsAt - now)}`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {dateLabel(lecture.date)} ·{' '}
                <bdi>
                  {lecture.meeting.start} – {lecture.meeting.end}
                </bdi>
              </p>
              <p className="mt-2 break-words text-sm">
                {lecture.meeting.room?.trim()
                  ? `القاعة: ${lecture.meeting.room}`
                  : 'لم تحدد القاعة'}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              {data.courses.some((c) => c.meetings.length)
                ? 'لا توجد محاضرة قادمة ضمن حدود الفصل. راجع الأيام والأوقات وتاريخ الفصل.'
                : 'أضف وقت المحاضرة وقاعتها من الجدول لتظهر هنا.'}
            </p>
          )}
          {holidayToday && (
            <p className="mt-2 text-xs text-slate-400">
              الوقت حسب جدولك المدخل؛ تأكد من إعلان الجامعة عن دوام اليوم.
            </p>
          )}
        </div>
        <div
          className={`card p-4 ${holidayToday ? 'border-amber-200 bg-amber-50' : ''}`}
        >
          <p className="text-xs font-bold text-brand-700">أقرب عطلة ثابتة</p>
          <h3 className="mt-2 font-bold">
            {holidayToday ? `اليوم مناسبة ${holiday.title}` : holiday.title}
          </h3>
          <p className="mt-2 text-sm text-brand-800">
            {dateLabel(holiday.date)}
            {!holidayToday &&
              ` · بعد ${remainingTime(campusTimestamp(`${holiday.date}T00:00`)! - now)}`}
          </p>
          <p className="mt-2 text-xs leading-6 text-slate-300">
            {'note' in holiday
              ? holiday.note
              : 'مناسبة ذات تاريخ ميلادي ثابت تتكرر كل سنة.'}{' '}
            تعطيل الجامعة يُؤكَّد بإعلانها، وليس بهذا التنبيه.
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold text-brand-700">أقرب موعد أدخلته</p>
          {deadline ? (
            <>
              <h3 className="mt-2 break-words font-bold">
                {deadline.course.name || 'مادة'} —{' '}
                {deadline.deadline.title ||
                  { midterm: 'ميد', final: 'فاينل', project: 'تسليم مشروع' }[
                    deadline.deadline.kind
                  ]}
              </h3>
              <p className="mt-2 text-sm text-brand-800">
                {deadline.at === now
                  ? 'موعده الآن'
                  : `بعد ${remainingTime(deadline.at - now)}`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {dateLabel(deadline.deadline.at.slice(0, 10))} ·{' '}
                <bdi>{deadline.deadline.at.slice(11)}</bdi>
              </p>
              {deadline.deadline.room?.trim() && (
                <p className="mt-2 break-words text-sm">
                  القاعة: {deadline.deadline.room}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              لا يوجد اختبار أو تسليم قادم أدخلته. أضف الموعد الخاص بمادتك من
              الجدول.
            </p>
          )}
        </div>
      </div>
      <p className="text-xs leading-6 text-slate-400">
        نعرض أقرب محاضرة وعطلة ثابتة وموعد أدخلته فقط، بتوقيت عمّان. مواعيد
        الامتحانات وبداية الفصل تُدخلها أنت؛ لا نعتمد أي تقويم جامعي غير معتمد،
        ولا نحسب الأعياد الهجرية تلقائيًا.
      </p>
    </section>
  );
}
