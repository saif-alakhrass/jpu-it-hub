import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SemesterSummaryCard } from './SemesterSummaryCard';
import { emptySemester, newCourse } from '@/lib/studentAssistant';
import { renderSemesterCard } from '@/lib/semesterCard';
import { downloadBlob } from '@/lib/downloadBlob';

vi.mock('@/lib/semesterCard', () => ({ renderSemesterCard: vi.fn() }));
vi.mock('@/lib/downloadBlob', () => ({ downloadBlob: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const data = () => ({
  ...emptySemester(),
  name: 'سيف',
  courses: [
    {
      ...newCourse(),
      name: 'برمجة',
      grade: '90',
      meetings: [
        {
          id: 'm1',
          days: [0],
          start: '10:00',
          end: '11:00',
          room: 'قاعة قديمة',
        },
      ],
    },
  ],
});

it('prints only the card contents and removes print state when closed', () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const { unmount, rerender } = render(
    <SemesterSummaryCard data={data()} onChange={vi.fn()} />,
  );
  const printable = document.querySelector(
    '.semester-card-print-root',
  ) as HTMLElement;
  expect(printable.parentElement).toBe(document.body);
  expect(printable.querySelector('input, button, nav')).toBeNull();
  expect(printable.textContent).toContain('المعدل الفصلي: 90.00%');
  expect(printable.textContent).not.toContain('قاعة قديمة');
  fireEvent.click(screen.getByRole('button', { name: 'طباعة بطاقة الفصل' }));
  expect(print).toHaveBeenCalledOnce();
  rerender(
    <SemesterSummaryCard
      data={{ ...data(), name: 'اسم محدث' }}
      onChange={vi.fn()}
    />,
  );
  expect(printable.textContent).toContain('اسم محدث');
  unmount();
  expect(document.querySelector('.semester-card-print-root')).toBeNull();
  expect(document.body.classList.contains('semester-card-printing')).toBe(
    false,
  );
});

it('exports the current GPA card as PNG and reports failures honestly', async () => {
  const blob = new Blob(['png'], { type: 'image/png' });
  vi.mocked(renderSemesterCard)
    .mockResolvedValueOnce(blob)
    .mockRejectedValueOnce(new Error('canvas failed'));
  const current = data();
  render(<SemesterSummaryCard data={current} onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'حفظ البطاقة PNG' }));
  await waitFor(() =>
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'jpu-semester.png'),
  );
  expect(renderSemesterCard).toHaveBeenCalledWith(current);
  await waitFor(() =>
    expect(screen.queryByText('جارٍ تجهيز الصورة…')).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'حفظ البطاقة PNG' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'تعذر تصدير الصورة',
    ),
  );
  expect(downloadBlob).toHaveBeenCalledOnce();
});

it('labels missing grades as incomplete instead of printing a false GPA', () => {
  render(
    <SemesterSummaryCard
      data={{ ...data(), courses: [{ ...newCourse(), name: 'برمجة' }] }}
      onChange={vi.fn()}
    />,
  );
  const preview = within(
    screen.getByRole('region', { name: 'معاينة بطاقة الفصل' }),
  );
  expect(preview.getByText('المعدل الفصلي: غير مكتمل')).toBeTruthy();
  expect(preview.getByText('التراكمي: غير مكتمل')).toBeTruthy();
});
