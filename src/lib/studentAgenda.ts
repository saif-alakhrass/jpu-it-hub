import type { Meeting, StudentSemester } from './studentAssistant';
import {
  campusDate,
  campusTimestamp,
  minutes,
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

type LectureStatus =
  | { kind: 'active'; endsAt: number }
  | { kind: 'upcoming'; startsAt: number; date: string }
  | { kind: 'finished' | 'outside-term' | 'invalid' };

// Status belongs to each meeting, not just the next course in the schedule.
// Keep today's completed lecture visible until campus midnight.
export function lectureStatus(
  meeting: Meeting,
  { startsOn, endsOn }: Pick<StudentSemester, 'startsOn' | 'endsOn'>,
  now: number,
): LectureStatus {
  const start = minutes(meeting.start),
    end = minutes(meeting.end);
  if (
    !meeting.days.length ||
    start === null ||
    end === null ||
    end <= start ||
    (startsOn && !validDate(startsOn)) ||
    (endsOn && !validDate(endsOn)) ||
    (startsOn && endsOn && endsOn < startsOn)
  )
    return { kind: 'invalid' };
  const today = campusDate(now);
  if (endsOn && today > endsOn) return { kind: 'outside-term' };
  const todayDay = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (
    (!startsOn || today >= startsOn) &&
    meeting.days.includes(todayDay) &&
    now >= campusTimestamp(`${today}T${meeting.end}`)!
  )
    return { kind: 'finished' };
  const first = new Date(`${today < startsOn ? startsOn : today}T12:00:00Z`);
  // Weekly schedule, no unconfirmed academic dates or automatic cancellations.
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(first.getTime() + offset * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    if (endsOn && date > endsOn) break;
    if (!meeting.days.includes(day.getUTCDay())) continue;
    const startsAt = campusTimestamp(`${date}T${meeting.start}`)!;
    const endsAt = campusTimestamp(`${date}T${meeting.end}`)!;
    if (startsAt <= now && now < endsAt) return { kind: 'active', endsAt };
    if (startsAt > now) return { kind: 'upcoming', startsAt, date };
  }
  return { kind: 'outside-term' };
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
