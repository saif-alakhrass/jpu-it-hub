import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentAssistantPage } from './StudentAssistantPage';
import { matchSubject } from '@/lib/assistantSubjects';
import type { Subject } from '@/lib/types';
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
    fireEvent.click(screen.getByRole('tab', { name: 'الجدول والمواعيد' }));
    expect(screen.getByText(/برمجة بايثون/)).toBeTruthy();
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
  it('updates date/time inputs immediately and retains them across tabs', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'أضف مادة' }));
    fireEvent.click(screen.getByRole('tab', { name: 'الجدول والمواعيد' }));
    fireEvent.input(screen.getByLabelText('بداية الفصل'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(screen.getByText(/مادة بدون اسم/));
    fireEvent.click(screen.getByRole('button', { name: 'إضافة وقت محاضرة' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'الأحد' }));
    fireEvent.input(screen.getByLabelText('من'), {
      target: { value: '10:00' },
    });
    fireEvent.input(screen.getByLabelText('إلى'), {
      target: { value: '11:00' },
    });
    expect(screen.getByText('10:00 – 11:00')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'بطاقة الفصل' }));
    expect(screen.getByText('10:00 – 11:00')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'الجدول والمواعيد' }));
    expect(
      (screen.getByLabelText('بداية الفصل') as HTMLInputElement).value,
    ).toBe('2026-09-01');
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
