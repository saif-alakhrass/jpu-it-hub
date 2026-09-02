import { describe, expect, it } from 'vitest';
import { nearestDeadline, lectureStatus, remainingTime } from './studentAgenda';
import { campusDate, campusTimestamp } from './scheduleUtils';
import { FIXED_HOLIDAYS, nearestFixedHoliday } from './fixedHolidays';
import { emptySemester, newCourse, parseSemester } from './studentAssistant';

const at = (date: string) => campusTimestamp(date)!;
const state = () => ({
  ...emptySemester(),
  courses: [
    {
      ...newCourse(),
      name: 'شبكات',
      meetings: [
        {
          id: 'm1',
          days: [0, 2],
          start: '10:00',
          end: '11:00',
          room: 'IT 203',
        },
      ],
    },
  ],
});
describe('per-lecture status and room compatibility', () => {
  it('counts down to the lecture, then its end, then keeps it completed today', () => {
    const data = state();
    const meeting = data.courses[0]!.meetings[0]!;
    expect(lectureStatus(meeting, data, at('2026-09-06T09:00'))).toEqual({
      kind: 'upcoming',
      startsAt: at('2026-09-06T10:00'),
      date: '2026-09-06',
    });
    expect(lectureStatus(meeting, data, at('2026-09-06T10:00'))).toEqual({
      kind: 'active',
      endsAt: at('2026-09-06T11:00'),
    });
    expect(lectureStatus(meeting, data, at('2026-09-06T10:59'))).toEqual({
      kind: 'active',
      endsAt: at('2026-09-06T11:00'),
    });
    expect(lectureStatus(meeting, data, at('2026-09-06T11:00'))).toEqual({
      kind: 'finished',
    });
    expect(lectureStatus(meeting, data, at('2026-09-06T23:59'))).toEqual({
      kind: 'finished',
    });
    expect(lectureStatus(meeting, data, at('2026-09-07T00:00'))).toMatchObject({
      kind: 'upcoming',
      date: '2026-09-08',
    });
  });
  it('honors user bounds only, never assumes the discarded university term', () => {
    const data = state();
    const meeting = data.courses[0]!.meetings[0]!;
    expect(lectureStatus(meeting, data, at('2030-06-01T10:00')).kind).toBe(
      'upcoming',
    );
    data.startsOn = '2026-10-01';
    data.endsOn = '2026-10-31';
    expect(lectureStatus(meeting, data, at('2026-09-06T09:00'))).toMatchObject({
      kind: 'upcoming',
      date: '2026-10-04',
    });
    expect(lectureStatus(meeting, data, at('2026-11-01T09:00')).kind).toBe(
      'outside-term',
    );
    data.endsOn = '2026-09-30';
    expect(lectureStatus(meeting, data, at('2026-09-06T09:00')).kind).toBe(
      'invalid',
    );
    data.startsOn = '2026-02-30';
    expect(lectureStatus(meeting, data, at('2026-09-06T09:00')).kind).toBe(
      'invalid',
    );
  });
  it('uses Amman dates and wraps a weekly meeting after its end', () => {
    const data = state();
    data.courses[0]!.meetings[0]!.days = [0];
    expect(campusDate(Date.parse('2026-09-05T21:15:00Z'))).toBe('2026-09-06');
    const meeting = data.courses[0]!.meetings[0]!;
    expect(lectureStatus(meeting, data, at('2026-09-07T00:00'))).toMatchObject({
      kind: 'upcoming',
      date: '2026-09-13',
    });
    data.courses[0]!.meetings[0]!.end = '09:00';
    expect(lectureStatus(meeting, data, at('2026-09-06T09:00')).kind).toBe(
      'invalid',
    );
  });
  it('does not silently cancel a lecture on a fixed occasion', () => {
    const data = state();
    data.courses[0]!.meetings[0]!.days = [5];
    expect(
      lectureStatus(
        data.courses[0]!.meetings[0]!,
        data,
        at('2027-01-01T09:00'),
      ),
    ).toMatchObject({ kind: 'upcoming', date: '2027-01-01' });
  });
  it('keeps states independent for multiple slots and never treats another weekday as finished', () => {
    const data = state();
    const meeting = data.courses[0]!.meetings[0]!;
    const now = at('2026-09-06T10:30');
    expect(
      lectureStatus({ ...meeting, start: '08:00', end: '09:00' }, data, now)
        .kind,
    ).toBe('finished');
    expect(lectureStatus(meeting, data, now).kind).toBe('active');
    expect(
      lectureStatus({ ...meeting, start: '11:00', end: '12:00' }, data, now)
        .kind,
    ).toBe('upcoming');
    expect(
      lectureStatus(
        { ...meeting, days: [1], start: '08:00', end: '09:00' },
        data,
        now,
      ).kind,
    ).toBe('upcoming');
    expect(lectureStatus({ ...meeting, days: [] }, data, now).kind).toBe(
      'invalid',
    );
    expect(
      lectureStatus({ ...meeting, start: '23:00', end: '01:00' }, data, now)
        .kind,
    ).toBe('invalid');
    expect(
      lectureStatus(
        meeting,
        { startsOn: '2026-09-07', endsOn: '2026-09-07' },
        now,
      ).kind,
    ).toBe('outside-term');
  });
  it('selects only the nearest valid personal deadline, excluding elapsed ones', () => {
    const data = {
      ...emptySemester(),
      courses: [
        {
          ...newCourse(),
          deadlines: [
            {
              id: 'late',
              title: 'مشروع',
              kind: 'project' as const,
              at: '2026-10-01T10:00',
            },
            {
              id: 'past',
              title: '',
              kind: 'midterm' as const,
              at: '2026-08-01T10:00',
            },
            {
              id: 'next',
              title: '',
              kind: 'midterm' as const,
              at: '2026-09-08T10:00',
              room: 'مختبر 2',
            },
            { id: 'invalid', title: '', kind: 'final' as const, at: '' },
          ],
        },
      ],
    };
    expect(
      nearestDeadline(data, at('2026-09-01T10:00'))?.deadline,
    ).toMatchObject({ id: 'next', room: 'مختبر 2' });
    expect(nearestDeadline(data, at('2026-10-01T10:00'))?.deadline.id).toBe(
      'late',
    );
    expect(nearestDeadline(data, at('2026-10-01T10:01'))).toBeNull();
  });
  it('preserves existing storage without rooms and validates new rooms', () => {
    const data = {
      ...emptySemester(),
      courses: [
        {
          ...newCourse(),
          meetings: [{ id: 'm1', days: [0], start: '10:00', end: '11:00' }],
          deadlines: [{ id: 'd1', kind: 'final', title: '', at: '' }],
        },
      ],
    };
    const parsed = parseSemester(JSON.stringify(data));
    expect(parsed.courses[0]!.meetings[0]!.room).toBe('');
    expect(parsed.courses[0]!.deadlines[0]!.room).toBe('');
    parsed.courses[0]!.meetings[0]!.room = 'قاعة 203';
    parsed.courses[0]!.deadlines[0]!.room = 'مختبر 1';
    expect(parseSemester(JSON.stringify(parsed))).toEqual(parsed);
    parsed.courses[0]!.meetings[0]!.room = 'x'.repeat(101);
    expect(() => parseSemester(JSON.stringify(parsed))).toThrow();
  });
  it('formats near deadlines without saying zero minutes before they start', () => {
    expect(remainingTime(1)).toBe('1 دقيقة');
    expect(remainingTime(0)).toBe('الآن');
    expect(remainingTime(90_000)).toBe('2 دقيقة');
    expect(remainingTime(90_000_000)).toBe('1 يوم و1 ساعة');
  });
});
describe('fixed Gregorian holiday hints', () => {
  it('only includes the four fixed-date occasions, not academic or lunar dates', () => {
    expect(FIXED_HOLIDAYS.map((h) => h.monthDay)).toEqual([
      '01-01',
      '05-01',
      '05-25',
      '12-25',
    ]);
    expect(nearestFixedHoliday(at('2026-09-01T10:00')).id).toBe('christmas');
    expect(nearestFixedHoliday(at('2026-05-02T00:00')).id).toBe(
      'independence-day',
    );
  });
  it('keeps today visible all day in Amman and rolls to next year', () => {
    expect(nearestFixedHoliday(at('2026-12-25T23:59')).date).toBe('2026-12-25');
    expect(nearestFixedHoliday(at('2026-12-26T00:00')).date).toBe('2027-01-01');
    expect(nearestFixedHoliday(at('2027-01-01T23:59')).date).toBe('2027-01-01');
    expect(nearestFixedHoliday(at('2027-01-02T00:00')).date).toBe('2027-05-01');
  });
});
