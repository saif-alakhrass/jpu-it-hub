import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAssistantPage } from './StudentAssistantPage';
import { matchSubject } from '@/lib/assistantSubjects';
import type { Subject } from '@/lib/types';
import {
  emptySemester,
  newCourse,
  parseSemester,
  STUDENT_STORAGE_KEY,
} from '@/lib/studentAssistant';
vi.mock('@/hooks/useSubjects', () => ({
  useAllSubjects: () => ({
    subjects: [
      {
        id: 'python-id',
        name: 'برمجة بايثون',
        major: 'علم الحاسوب',
        code: 'CS101',
      },
    ],
    loading: false,
    error: null,
  }),
}));
const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () =>
    auth.signedIn
      ? {
          session: { user: { id: 'student-id' } },
          profile: { id: 'student-id', role: 'student' },
        }
      : { session: null, profile: null },
}));
vi.mock('@/services/assistantLibrary', () => ({
  fetchAssistantLibraryCounts: async () => ({ summaries: 4, slides: 7 }),
}));
beforeEach(() => {
  localStorage.clear();
  auth.signedIn = true;
});
afterEach(cleanup);
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <StudentAssistantPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('interconnected student assistant', () => {
  it('keeps advanced course fields optional without losing edits or input focus', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'أضف مادة' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    const toggle = screen.getByRole('button', {
      name: 'الربط بالمكتبة وإعادة المادة',
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('checkbox'));
    const oldGrade = screen.getByLabelText('العلامة القديمة');
    oldGrade.focus();
    fireEvent.change(oldGrade, { target: { value: '55' } });
    expect(document.activeElement).toBe(oldGrade);
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('العلامة القديمة')).toBeNull();
    fireEvent.click(toggle);
    expect(
      (screen.getByLabelText('العلامة القديمة') as HTMLInputElement).value,
    ).toBe('55');
    fireEvent.click(screen.getByRole('tab', { name: 'مكتبة فصلي' }));
    fireEvent.click(screen.getByRole('button', { name: 'تعديل مواد الفصل' }));
    expect(
      (screen.getByLabelText('العلامة القديمة') as HTMLInputElement).value,
    ).toBe('55');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'المعدل والمواد' }),
    );
  });
  it('keeps the redesigned tabs keyboard accessible with the correct panel relationship', () => {
    mount();
    const calculator = screen.getByRole('tab', { name: 'المعدل والمواد' });
    const library = screen.getByRole('tab', { name: 'مكتبة فصلي' });
    expect(calculator.getAttribute('aria-controls')).toBe(
      'assistant-panel-calculator',
    );
    expect(library.getAttribute('aria-controls')).toBe(
      'assistant-panel-library',
    );
    fireEvent.keyDown(calculator, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(library);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      library.id,
    );
    fireEvent.keyDown(library, { key: 'Home' });
    expect(document.activeElement).toBe(calculator);
  });
  it('keeps only calculator and library tabs, with card export under the GPA result', () => {
    mount();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: 'الجدول والمواعيد' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'بطاقة الفصل' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'معاينة بطاقة الفصل' }),
    ).toBeNull();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'توقعات الفصل' })).getByRole(
        'button',
        { name: 'طباعة / حفظ بطاقة الفصل' },
      ),
    );
    expect(
      screen.getByRole('region', { name: 'معاينة بطاقة الفصل' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'طباعة بطاقة الفصل' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'حفظ البطاقة PNG' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'مكتبة فصلي' }));
    expect(document.querySelector('.semester-card-print-root')).toBeNull();
    expect(document.body.classList.contains('semester-card-printing')).toBe(
      false,
    );
  });
  it('keeps focus while editing and shares one course across tabs and reloads', async () => {
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'أضف مادة' }));
    const name = screen.getByLabelText('اسم المادة');
    name.focus();
    fireEvent.change(name, { target: { value: 'برمجة بايثون' } });
    expect(document.activeElement).toBe(name);
    fireEvent.change(screen.getByLabelText('العلامة المتوقعة'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'مكتبة فصلي' }));
    await waitFor(() => expect(screen.getByText('4')).toBeTruthy());
    expect(
      screen.getByRole('link', { name: /تلاخيص وشروحات/ }).getAttribute('href'),
    ).toBe('/subject/python-id?tab=summaries');
    expect(
      screen.queryByRole('link', { name: /امتحانات وسنوات سابقة/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'المعدل والمواد' }));
    expect(
      (screen.getByLabelText('اسم المادة') as HTMLInputElement).value,
    ).toBe('برمجة بايثون');
    unmount();
    mount();
    expect(
      (screen.getByLabelText('العلامة المتوقعة') as HTMLInputElement).value,
    ).toBe('90');
  });
  it('only auto-links unique normalized exact names or codes', () => {
    const subjects = [
      { id: 'one', name: 'أمن شبكات', code: 'CS201' },
      { id: 'two', name: 'برمجة' },
    ] as Subject[];
    expect(matchSubject('امن شبكات', subjects)).toBe('one');
    expect(matchSubject('cs201', subjects)).toBe('one');
    expect(matchSubject('شبكات', subjects)).toBeNull();
    expect(
      matchSubject('أمن شبكات', [
        ...subjects,
        { ...subjects[0]!, id: 'three' },
      ]),
    ).toBeNull();
  });
  it('preserves legacy schedule data without displaying it and shares card edits across tabs', () => {
    const legacy = {
      ...emptySemester(),
      startsOn: '2026-09-01',
      endsOn: '2026-12-31',
      courses: [
        {
          ...newCourse(),
          name: 'شبكات',
          grade: '90',
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
              kind: 'midterm' as const,
              title: 'ميد',
              at: '2026-11-01T10:00',
            },
          ],
        },
      ],
    };
    localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(legacy));
    const { unmount } = mount();
    fireEvent.click(
      screen.getByRole('button', { name: 'طباعة / حفظ بطاقة الفصل' }),
    );
    const name = screen.getByLabelText('اسم الطالب (اختياري)');
    name.focus();
    fireEvent.change(name, { target: { value: 'طالب تجريبي' } });
    expect(document.activeElement).toBe(name);
    expect(
      within(
        screen.getByRole('region', { name: 'معاينة بطاقة الفصل' }),
      ).getByText('طالب تجريبي'),
    ).toBeTruthy();
    expect(screen.queryByText('IT 203')).toBeNull();
    expect(screen.queryByText('10:00 – 11:00')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'مكتبة فصلي' }));
    fireEvent.click(screen.getByRole('tab', { name: 'المعدل والمواد' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'طباعة / حفظ بطاقة الفصل' }),
    );
    expect(
      (screen.getByLabelText('اسم الطالب (اختياري)') as HTMLInputElement).value,
    ).toBe('طالب تجريبي');
    unmount();
    const saved = parseSemester(localStorage.getItem(STUDENT_STORAGE_KEY)!);
    expect(saved.name).toBe('طالب تجريبي');
    expect(saved.startsOn).toBe(legacy.startsOn);
    expect(saved.courses[0]?.meetings).toEqual(legacy.courses[0]?.meetings);
    expect(saved.courses[0]?.deadlines[0]?.id).toBe('d1');
  });
  it('asks anonymous visitors to sign in rather than showing false zero counts', () => {
    auth.signedIn = false;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'أضف مادة' }));
    fireEvent.change(screen.getByLabelText('اسم المادة'), {
      target: { value: 'برمجة بايثون' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'مكتبة فصلي' }));
    expect(screen.getByRole('link', { name: 'سجّل الدخول' })).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});
