import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LectureSchedule } from './LectureSchedule';
import { campusTimestamp } from '@/lib/scheduleUtils';
import { emptySemester, newCourse } from '@/lib/studentAssistant';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('renders every lecture with its own status and updates in place at start and end', () => {
  vi.useFakeTimers();
  vi.setSystemTime(campusTimestamp('2026-09-06T09:59')!);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const courses = [
    {
      ...newCourse(),
      name: 'برمجة كينونية',
      meetings: [
        {
          id: 'early',
          days: [0, 2],
          start: '08:00',
          end: '09:00',
          room: '713',
        },
      ],
    },
    {
      ...newCourse(),
      name: 'شبكات',
      meetings: [
        {
          id: 'now',
          days: [0, 2],
          start: '10:00',
          end: '11:00',
          room: 'IT 203',
        },
      ],
    },
    {
      ...newCourse(),
      name: 'برمجة مختارة',
      meetings: [
        { id: 'late', days: [0, 2], start: '11:00', end: '12:00', room: '715' },
      ],
    },
  ];
  render(<LectureSchedule data={{ ...emptySemester(), courses }} />);
  const early = screen.getByRole('article', { name: 'محاضرة برمجة كينونية' });
  const current = screen.getByRole('article', { name: 'محاضرة شبكات' });
  const late = screen.getByRole('article', { name: 'محاضرة برمجة مختارة' });
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(within(early).getByText('انتهت اليوم')).toBeTruthy();
  expect(within(current).getByText('تبدأ بعد 1 دقيقة')).toBeTruthy();
  expect(within(current).getByText('IT 203')).toBeTruthy();
  expect(within(current).getByText('الأحد، الثلاثاء')).toBeTruthy();
  expect(within(late).getByText('تبدأ بعد 1 ساعة و1 دقيقة')).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_000));
  expect(
    within(current).getByText('جارية الآن · تنتهي بعد 1 ساعة'),
  ).toBeTruthy();
  expect(current.className).toContain('border-emerald-500');
  act(() => vi.advanceTimersByTime(60 * 60_000));
  expect(within(current).getByText('انتهت اليوم')).toBeTruthy();
  expect(current.className).not.toContain('border-emerald-500');
  expect(within(late).getByText('جارية الآن · تنتهي بعد 1 ساعة')).toBeTruthy();
  expect(screen.getByRole('article', { name: 'محاضرة شبكات' })).toBe(current);
  expect(screen.queryByText(/بعد 0 دقيقة/)).toBeNull();
});

it('retains only the nearest deadline and a compact fixed holiday note', () => {
  vi.useFakeTimers();
  vi.setSystemTime(campusTimestamp('2027-05-01T12:00')!);
  render(
    <LectureSchedule
      data={{
        ...emptySemester(),
        courses: [
          {
            ...newCourse(),
            name: 'شبكات',
            deadlines: [
              {
                id: 'd1',
                at: '2027-05-02T12:00',
                title: 'موعد قريب',
                kind: 'midterm',
                room: 'مختبر 2',
              },
              {
                id: 'd2',
                at: '2027-05-05T12:00',
                title: 'موعد أبعد',
                kind: 'project',
              },
            ],
          },
        ],
      }}
    />,
  );
  const note = screen.getByRole('complementary', { name: 'تذكير المواعيد' });
  expect(within(note).getByText(/اليوم مناسبة عيد العمال/)).toBeTruthy();
  expect(within(note).getByText(/موعد قريب/)).toBeTruthy();
  expect(within(note).getByText('مختبر 2')).toBeTruthy();
  expect(screen.queryByText(/موعد أبعد/)).toBeNull();
  expect(screen.queryByText('الآن والقادم')).toBeNull();
  expect(screen.queryByRole('link', { name: /تقويم جامعة/ })).toBeNull();
});
