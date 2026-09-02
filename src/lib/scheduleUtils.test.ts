import { describe, expect, it } from 'vitest';
import {
  buildSemesterCalendar,
  campusTimestamp,
  countdown,
  foldIcalLine,
  scheduleConflicts,
  validDate,
} from './scheduleUtils';
import { emptySemester, newCourse } from './studentAssistant';
const meeting = (start = '10:00', end = '11:00', days = [0, 2]) => ({
  id: crypto.randomUUID(),
  start,
  end,
  days,
});

describe('student schedule', () => {
  it('detects overlaps on shared days, including containment', () => {
    const courses = [
      { ...newCourse(), meetings: [meeting()] },
      { ...newCourse(), meetings: [meeting('10:30', '12:00', [0])] },
    ];
    expect(scheduleConflicts(courses)).toHaveLength(1);
    courses[1]!.meetings = [meeting('09:00', '13:00', [2])];
    expect(scheduleConflicts(courses)).toHaveLength(1);
  });
  it('allows back-to-back lectures and different days', () => {
    expect(
      scheduleConflicts([
        { ...newCourse(), meetings: [meeting()] },
        {
          ...newCourse(),
          meetings: [meeting('11:00', '12:00'), meeting('10:00', '11:00', [1])],
        },
      ]),
    ).toHaveLength(0);
  });
  it('rejects invalid dates and backwards or overnight meetings', () => {
    expect(validDate('2026-02-30')).toBe(false);
    expect(campusTimestamp('2026-09-10T25:00')).toBeNull();
    expect(() =>
      buildSemesterCalendar({
        ...emptySemester(),
        courses: [{ ...newCourse(), meetings: [meeting('23:00', '01:00')] }],
      }),
    ).toThrow();
  });
  it('exports escaped, bounded UTC recurring events and deadlines without alarms', () => {
    const data = {
      ...emptySemester(),
      startsOn: '2026-09-01',
      endsOn: '2026-12-31',
      courses: [
        {
          ...newCourse(),
          name: 'برمجة; Python, 1\nBEGIN:VEVENT',
          meetings: [{ ...meeting(), room: 'IT; 203, A\nBEGIN:VEVENT' }],
          deadlines: [
            {
              id: 'exam-1',
              title: 'فاينل',
              kind: 'final' as const,
              at: '2026-12-20T12:00',
              room: 'مختبر 2',
            },
          ],
        },
      ],
    };
    const ics = buildSemesterCalendar(data, Date.UTC(2026, 8, 1));
    expect(ics).toContain('DTSTART:20260906T070000Z'); // Sunday 10:00 in Amman
    expect(ics).toContain('DTSTART:20260901T070000Z'); // Tuesday, first day
    expect(ics).toContain('UNTIL=20261231T205900Z');
    expect(ics).toContain('DTSTART:20261220T090000Z');
    expect(ics.replace(/\r\n /g, '')).toContain(
      'LOCATION:IT\\; 203\\, A\\nBEGIN:VEVENT',
    );
    expect(ics).toContain('LOCATION:مختبر 2');
    expect(ics.replace(/\r\n /g, '')).toContain(
      'برمجة\\; Python\\, 1\\nBEGIN:VEVENT',
    );
    expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(3);
    expect(ics).not.toContain('VALARM');
    expect(ics.endsWith('\r\n')).toBe(true);
    ics
      .split('\r\n')
      .forEach((line) =>
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75),
      );
  });
  it('folds Arabic on UTF-8 boundaries without losing text', () => {
    const text = 'SUMMARY:' + 'امتحان اللغة العربية '.repeat(20);
    expect(foldIcalLine(text).replace(/\r\n /g, '')).toBe(text);
  });
  it('shows upcoming, imminent and elapsed deadlines', () => {
    const now = campusTimestamp('2026-09-01T10:00')!;
    expect(countdown('2026-09-02T12:00', now)).toBe('1 يوم و2 ساعة');
    expect(countdown('2026-09-01T10:30', now)).toBe('خلال أقل من ساعة');
    expect(countdown('2026-09-01T09:00', now)).toBe('انقضى الموعد');
  });
  it('allows deadline-only export and requires semester bounds for lectures', () => {
    expect(() =>
      buildSemesterCalendar({
        ...emptySemester(),
        courses: [{ ...newCourse(), meetings: [meeting()] }],
      }),
    ).toThrow();
    expect(
      buildSemesterCalendar({
        ...emptySemester(),
        courses: [
          {
            ...newCourse(),
            deadlines: [
              { id: 'd-1', at: '2026-09-01T10:00', kind: 'project', title: '' },
            ],
          },
        ],
      }),
    ).toContain('BEGIN:VEVENT');
  });
});
