import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StudentAgenda } from './StudentAgenda';
import { campusTimestamp } from '@/lib/scheduleUtils';
import { emptySemester, newCourse } from '@/lib/studentAssistant';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('changes from start to end countdown without refreshing and shows only the nearest deadline', () => {
  vi.useFakeTimers();
  vi.setSystemTime(campusTimestamp('2026-09-06T09:59')!);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  render(
    <StudentAgenda
      data={{
        ...emptySemester(),
        courses: [
          {
            ...newCourse(),
            name: 'شبكات',
            meetings: [
              {
                id: 'm1',
                days: [0],
                start: '10:00',
                end: '11:00',
                room: 'IT 203',
              },
            ],
            deadlines: [
              {
                id: 'd1',
                at: '2026-09-07T12:00',
                title: 'الامتحان الأقرب',
                kind: 'midterm',
                room: 'مختبر 2',
              },
              {
                id: 'd2',
                at: '2026-09-09T12:00',
                title: 'موعد أبعد',
                kind: 'project',
              },
            ],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('تبدأ بعد 1 دقيقة')).toBeTruthy();
  expect(screen.getByText('القاعة: IT 203')).toBeTruthy();
  expect(screen.getByText('القاعة: مختبر 2')).toBeTruthy();
  expect(screen.queryByText(/موعد أبعد/)).toBeNull();
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText('محاضرتك الآن')).toBeTruthy();
  expect(screen.getByText('تنتهي بعد 1 ساعة')).toBeTruthy();
});

it('labels a fixed occasion without claiming an imported university closure', () => {
  vi.useFakeTimers();
  vi.setSystemTime(campusTimestamp('2027-05-01T12:00')!);
  render(<StudentAgenda data={emptySemester()} />);
  expect(screen.getByText('اليوم مناسبة عيد العمال')).toBeTruthy();
  expect(screen.getByText(/قد يُنقل يوم التعطيل/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: /تقويم جامعة/ })).toBeNull();
  expect(screen.queryByText(/بدء فترة امتحانات/)).toBeNull();
});
