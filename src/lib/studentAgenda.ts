import type { StudentSemester } from './studentAssistant';
import {
  campusDate,
  campusTimestamp,
  dailyMeetings,
  validDate,
} from './scheduleUtils';

export function remainingTime(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 60_000));
  if (total === 0) return 'الآن';
  if (total < 60) return `${total} دقيقة`;
  const days = Math.floor(total / 1440),
    hours = Math.floor((total % 1440) / 60),
    minutes = total % 60;
  return [
    days ? `${days} يوم` : '',
    hours ? `${hours} ساعة` : '',
    minutes ? `${minutes} دقيقة` : '',
  ]
    .filter(Boolean)
    .join(' و');
}

export function nearestLecture(state: StudentSemester, now: number) {
  const { startsOn, endsOn } = state;
  if (
    (startsOn && !validDate(startsOn)) ||
    (endsOn && !validDate(endsOn)) ||
    (startsOn && endsOn && endsOn < startsOn)
  )
    return null;
  const today = campusDate(now);
  if (endsOn && today > endsOn) return null;
  const first = new Date(`${today < startsOn ? startsOn : today}T12:00:00Z`);
  // Weekly schedule, no unconfirmed academic dates or automatic cancellations.
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(first.getTime() + offset * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    if (endsOn && date > endsOn) break;
    const entries = dailyMeetings(state.courses, day.getUTCDay())
      .map((entry) => ({
        ...entry,
        date,
        startsAt: campusTimestamp(`${date}T${entry.meeting.start}`)!,
        endsAt: campusTimestamp(`${date}T${entry.meeting.end}`)!,
      }))
      .filter((entry) => entry.endsAt > now);
    const current = entries.find((entry) => entry.startsAt <= now);
    const next = current ?? entries[0];
    if (next) return { ...next, active: next.startsAt <= now };
  }
  return null;
}

export function nearestDeadline(state: StudentSemester, now: number) {
  return (
    state.courses
      .flatMap((course) =>
        course.deadlines.map((deadline) => ({
          course,
          deadline,
          at: campusTimestamp(deadline.at),
        })),
      )
      .filter(
        (event): event is typeof event & { at: number } =>
          event.at !== null && event.at >= now,
      )
      .sort((a, b) => a.at - b.at)[0] ?? null
  );
}
