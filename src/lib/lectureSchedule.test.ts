import { describe, expect, it } from 'vitest';
import {
  arabicDuration,
  lectureSnapshot,
  occurrencesForDay,
  validMeeting,
} from './lectureSchedule';
import { newCourse } from './studentAssistant';

const course = {
  ...newCourse(),
  name: 'البرمجة المتقدمة',
  meetings: [
    {
      id: 'meeting-1',
      days: [0, 2],
      start: '10:40',
      end: '11:55',
      building: 'مبنى الحاسوب',
      room: '713',
    },
  ],
};

describe('lecture schedule snapshot', () => {
  it('finds the current lecture and calculates its remaining time and progress', () => {
    const now = new Date(2026, 8, 6, 11, 17);
    const result = lectureSnapshot([course], now);
    expect(result.current?.course.name).toBe('البرمجة المتقدمة');
    expect(result.minutesLeft).toBe(38);
    expect(result.progress).toBeCloseTo((37 / 75) * 100);
  });

  it('keeps a lecture current at its start and ends it at the exact end time', () => {
    expect(
      lectureSnapshot([course], new Date(2026, 8, 6, 10, 40)).current,
    ).not.toBeNull();
    expect(
      lectureSnapshot([course], new Date(2026, 8, 6, 11, 55)).current,
    ).toBeNull();
  });

  it('places the progress indicator exactly halfway at the lecture midpoint', () => {
    const midpoint = lectureSnapshot(
      [course],
      new Date(2026, 8, 6, 11, 17, 30),
    );
    expect(midpoint.progress).toBe(50);
  });

  it('sorts today and finds the next occurrence later in the week', () => {
    const early = {
      ...newCourse(),
      name: 'الشبكات',
      meetings: [{ id: 'early', days: [0], start: '09:00', end: '10:00' }],
    };
    const sunday = new Date(2026, 8, 6, 12, 0);
    expect(
      occurrencesForDay([course, early], sunday).map((x) => x.course.name),
    ).toEqual(['الشبكات', 'البرمجة المتقدمة']);
    const next = lectureSnapshot([course], sunday).next;
    expect(next?.start.getDay()).toBe(2);
    expect(next?.meeting.start).toBe('10:40');
  });

  it('ignores incomplete and backwards meetings', () => {
    expect(
      validMeeting({ id: 'x', days: [], start: '10:00', end: '11:00' }),
    ).toBe(false);
    expect(
      validMeeting({ id: 'x', days: [0], start: '11:00', end: '10:00' }),
    ).toBe(false);
    expect(
      validMeeting({ id: 'x', days: [0], start: '25:00', end: '26:00' }),
    ).toBe(false);
  });

  it('formats short and long Arabic durations', () => {
    expect(arabicDuration(38)).toBe('38 دقيقة');
    expect(arabicDuration(60)).toBe('1 ساعة');
    expect(arabicDuration(80)).toBe('1 ساعة و20 دقيقة');
  });
});
