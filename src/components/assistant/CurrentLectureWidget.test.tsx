import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentLectureWidget } from './CurrentLectureWidget';
import {
  emptySemester,
  newCourse,
  type StudentSemester,
} from '@/lib/studentAssistant';

function Harness({ initial }: { initial: StudentSemester }) {
  const [data, setData] = useState(initial);
  return <CurrentLectureWidget data={data} onChange={setData} />;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 6, 11, 17));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('current lecture widget', () => {
  it('shows the live lecture, room, progress and today rail', () => {
    const data = {
      ...emptySemester(),
      courses: [
        {
          ...newCourse(),
          name: 'البرمجة المتقدمة',
          meetings: [
            {
              id: 'm1',
              days: [0],
              start: '10:40',
              end: '11:55',
              building: 'مبنى الحاسوب',
              room: '713',
            },
          ],
        },
      ],
    };
    render(<Harness initial={data} />);
    expect(
      screen.getByText('جارية الآن', { selector: '.assistant-live' }),
    ).toBeTruthy();
    expect(screen.getByText('مبنى الحاسوب · قاعة 713')).toBeTruthy();
    expect(screen.getByText(/38 دقيقة/)).toBeTruthy();
    const progress = screen.getByLabelText(/انقضى 49 بالمئة/);
    expect(progress).toBeTruthy();
    expect(
      (progress.firstElementChild as HTMLElement).style.getPropertyValue(
        '--lecture-progress',
      ),
    ).toBe(String(37 / 75));
  });

  it('edits one recurring schedule and hides the editor after saving', () => {
    const data = {
      ...emptySemester(),
      courses: [{ ...newCourse(), name: 'الشبكات' }],
    };
    render(<Harness initial={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'إعداد الجدول' }));
    fireEvent.click(screen.getByText('الشبكات', { selector: 'strong' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'الأحد' }));
    fireEvent.change(screen.getByLabelText('تبدأ'), {
      target: { value: '10:00' },
    });
    fireEvent.change(screen.getByLabelText('تنتهي'), {
      target: { value: '12:00' },
    });
    fireEvent.change(screen.getByLabelText('المبنى'), {
      target: { value: 'مبنى الحاسوب' },
    });
    fireEvent.change(screen.getByLabelText('رقم القاعة'), {
      target: { value: '713' },
    });
    expect(screen.getByText('مبنى الحاسوب · قاعة 713')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ وإخفاء الإعداد' }));
    expect(screen.queryByLabelText('تبدأ')).toBeNull();
    expect(screen.getByRole('button', { name: 'تعديل الجدول' })).toBeTruthy();
  });

  it('explains an invalid end time without treating it as a live lecture', () => {
    const data = {
      ...emptySemester(),
      courses: [
        {
          ...newCourse(),
          name: 'الشبكات',
          meetings: [{ id: 'm1', days: [0], start: '12:00', end: '10:00' }],
        },
      ],
    };
    render(<Harness initial={data} />);
    fireEvent.click(screen.getByRole('button', { name: 'إعداد الجدول' }));
    fireEvent.click(screen.getByText('الشبكات', { selector: 'strong' }));
    expect(screen.getByRole('alert').textContent).toContain(
      'وقت الانتهاء يجب أن يكون بعد وقت البداية',
    );
    expect(screen.queryByText('جارية الآن')).toBeNull();
  });
});
