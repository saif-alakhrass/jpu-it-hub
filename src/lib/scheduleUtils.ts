import type { EnrolledCourse, StudentSemester } from './studentAssistant';

export const WEEK_DAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];
export function minutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}
export function validDate(date: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}
// All entered dates are campus times (Amman, UTC+03), independent of the
// student's phone timezone. UTC iCalendar events keep imports unambiguous.
export function campusTimestamp(value: string): number | null {
  const [date, time] = value.split('T');
  if (!date || !time || !validDate(date) || minutes(time) === null) return null;
  return new Date(`${date}T${time}:00+03:00`).getTime();
}
export function dailyMeetings(courses: EnrolledCourse[], day: number) {
  return courses
    .flatMap((course, color) =>
      course.meetings.flatMap((meeting) => {
        const start = minutes(meeting.start),
          end = minutes(meeting.end);
        return meeting.days.includes(day) &&
          start !== null &&
          end !== null &&
          end > start
          ? [{ course, meeting, color, start, end }]
          : [];
      }),
    )
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
export function scheduleConflicts(courses: EnrolledCourse[]) {
  return WEEK_DAYS.flatMap((_, day) => {
    const items = dailyMeetings(courses, day);
    return items.flatMap((a, i) =>
      items
        .slice(i + 1)
        .filter((b) => a.start < b.end && b.start < a.end)
        .map((b) => ({ day, first: a, second: b })),
    );
  });
}
export function countdown(at: string, now: number): string {
  const timestamp = campusTimestamp(at);
  if (timestamp === null) return 'حدّد موعدًا صحيحًا';
  const delta = timestamp - now;
  if (delta <= 0) return 'انقضى الموعد';
  const hours = Math.floor(delta / 3_600_000);
  if (hours === 0) return 'خلال أقل من ساعة';
  return `${Math.floor(hours / 24)} يوم و${hours % 24} ساعة`;
}
export function scheduleErrors(state: StudentSemester): string[] {
  const errors: string[] = [];
  for (const c of state.courses) {
    for (const m of c.meetings) {
      const start = minutes(m.start),
        end = minutes(m.end);
      if (!m.days.length || start === null || end === null || end <= start)
        errors.push(
          `أكمل أيام ووقت المحاضرة للمادة «${c.name || 'بدون اسم'}». يجب أن يكون الانتهاء بعد البداية في اليوم نفسه.`,
        );
    }
    for (const d of c.deadlines)
      if (campusTimestamp(d.at) === null)
        errors.push(`أكمل موعد ${d.title || c.name || 'الاختبار'}.`);
  }
  return errors;
}
const escapeText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
export function foldIcalLine(line: string): string {
  const encoder = new TextEncoder();
  let output = '',
    length = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (length + bytes > 75) {
      output += '\r\n ';
      length = 1;
    }
    output += char;
    length += bytes;
  }
  return output;
}
export function buildSemesterCalendar(
  state: StudentSemester,
  now = Date.now(),
): string {
  const errors = scheduleErrors(state);
  if (errors.length) throw new Error(errors[0]);
  const hasMeetings = state.courses.some((c) => c.meetings.length > 0);
  if (
    hasMeetings &&
    (!validDate(state.startsOn) ||
      !validDate(state.endsOn) ||
      state.endsOn < state.startsOn)
  )
    throw new Error('حدّد تاريخ بداية الفصل ونهايته بشكل صحيح.');
  if (!state.courses.some((c) => c.meetings.length || c.deadlines.length))
    throw new Error('أضف محاضرة أو موعدًا قبل تصدير التقويم.');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JPU-IT Hub//Student Assistant//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:فصل الطالب — JPU-IT Hub',
  ];
  const event = (
    uid: string,
    title: string,
    start: number,
    end: number,
    rule?: string,
  ) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@jpu-it-hub.fyi`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(title)}`,
    );
    if (rule) lines.push(rule);
    lines.push('END:VEVENT');
  };
  for (const c of state.courses) {
    for (const m of c.meetings)
      for (const day of m.days) {
        const startDay = new Date(`${state.startsOn}T00:00:00Z`);
        startDay.setUTCDate(
          startDay.getUTCDate() + ((day - startDay.getUTCDay() + 7) % 7),
        );
        const date = startDay.toISOString().slice(0, 10);
        if (date > state.endsOn) continue;
        event(
          `${c.id}-${m.id}-${day}`,
          c.name || 'محاضرة',
          campusTimestamp(`${date}T${m.start}`)!,
          campusTimestamp(`${date}T${m.end}`)!,
          `RRULE:FREQ=WEEKLY;UNTIL=${stamp(campusTimestamp(`${state.endsOn}T23:59`)!)}`,
        );
      }
    for (const d of c.deadlines) {
      const at = campusTimestamp(d.at)!;
      // End times were not requested by the form; mark deadlines as one-minute
      // events instead of inventing an exam duration. No intrusive VALARM.
      event(
        `${c.id}-${d.id}`,
        `${c.name || 'مادة'} — ${d.title || { midterm: 'ميد', final: 'فاينل', project: 'تسليم مشروع' }[d.kind]}`,
        at,
        at + 60_000,
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcalLine).join('\r\n') + '\r\n';
}
