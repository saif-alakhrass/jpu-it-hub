import type { EnrolledCourse, Meeting } from './studentAssistant';

export interface LectureOccurrence {
  course: EnrolledCourse;
  meeting: Meeting;
  start: Date;
  end: Date;
}

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function atTime(day: Date, value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const result = new Date(day);
  result.setHours(hours!, minutes!, 0, 0);
  return result;
}

export function validMeeting(meeting: Meeting) {
  return (
    TIME.test(meeting.start) &&
    TIME.test(meeting.end) &&
    meeting.days.length > 0 &&
    meeting.end > meeting.start
  );
}

export function occurrencesForDay(
  courses: EnrolledCourse[],
  day: Date,
): LectureOccurrence[] {
  return courses
    .flatMap((course) =>
      course.meetings
        .filter(
          (meeting) =>
            validMeeting(meeting) && meeting.days.includes(day.getDay()),
        )
        .map((meeting) => ({
          course,
          meeting,
          start: atTime(day, meeting.start),
          end: atTime(day, meeting.end),
        })),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function lectureSnapshot(courses: EnrolledCourse[], now: Date) {
  const today = occurrencesForDay(courses, now);
  const current =
    today.find(({ start, end }) => now >= start && now < end) ?? null;
  let next = today.find(({ start }) => start > now) ?? null;
  if (!next) {
    for (let offset = 1; offset <= 7; offset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      next = occurrencesForDay(courses, day)[0] ?? null;
      if (next) break;
    }
  }
  const elapsed = current ? now.getTime() - current.start.getTime() : 0;
  const duration = current
    ? current.end.getTime() - current.start.getTime()
    : 1;
  return {
    today,
    current,
    next,
    progress: current
      ? Math.min(100, Math.max(0, (elapsed / duration) * 100))
      : 0,
    minutesLeft: current
      ? Math.max(1, Math.ceil((current.end.getTime() - now.getTime()) / 60_000))
      : null,
  };
}

export function minutesUntil(date: Date, now: Date) {
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 60_000));
}

export function arabicDuration(minutes: number) {
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ساعة و${rest} دقيقة` : `${hours} ساعة`;
}
