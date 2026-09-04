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
import { EnrolledCoursesHub } from './EnrolledCoursesHub';
import { newCourse, type EnrolledCourse } from '@/lib/studentAssistant';
import type { Role, Subject } from '@/lib/types';

const state = vi.hoisted(() => ({ signedIn: true, role: 'student' as Role }));
const fetchCounts = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    session: state.signedIn ? { user: { id: 'viewer' } } : null,
    profile: state.signedIn ? { id: 'viewer', role: state.role } : null,
  }),
}));
vi.mock('@/services/assistantLibrary', () => ({
  fetchAssistantLibraryCounts: fetchCounts,
}));
beforeEach(() => {
  state.signedIn = true;
  state.role = 'student';
  fetchCounts
    .mockReset()
    .mockImplementation(async (id: string) => ({
      summaries: id === 'python' ? 4 : 8,
      slides: 2,
      exams: 3,
    }));
});
afterEach(cleanup);
const subjects = [
  { id: 'python', name: 'برمجة بايثون', code: 'CS101', major: 'علم الحاسوب' },
  {
    id: 'networks',
    name: 'شبكات الحاسوب',
    code: 'CS201',
    major: 'علم الحاسوب',
  },
] as Subject[];
function mount() {
  const courses: EnrolledCourse[] = subjects.map((s) => ({
    ...newCourse(),
    id: s.id,
    name: s.name,
    subjectId: s.id,
  }));
  courses.push({
    ...newCourse(),
    id: 'private',
    name: 'مادة خاصة',
    subjectId: null,
  });
  const onEditCourses = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EnrolledCoursesHub
          courses={courses}
          subjects={subjects}
          loading={false}
          error={null}
          onEditCourses={onEditCourses}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(view());
  return { onEditCourses, rerender: () => rendered.rerender(view()) };
}
describe('semester library workspace', () => {
  it('fetches only the selected subject and uses the same selection for desktop and mobile', async () => {
    mount();
    await waitFor(() =>
      expect(fetchCounts).toHaveBeenCalledWith('python', 'student'),
    );
    expect(fetchCounts).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('المادة الحالية'), {
      target: { value: 'networks' },
    });
    await waitFor(() =>
      expect(fetchCounts).toHaveBeenCalledWith('networks', 'student'),
    );
    expect(
      screen
        .getByRole('button', { name: /شبكات الحاسوب/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('link', { name: /تلاخيص وشروحات/ }).getAttribute('href'),
    ).toBe('/subject/networks?tab=summaries');
    fireEvent.click(screen.getByRole('button', { name: /برمجة بايثون/ }));
    expect(
      (screen.getByLabelText('المادة الحالية') as HTMLSelectElement).value,
    ).toBe('python');
    expect(fetchCounts).toHaveBeenCalledTimes(2);
  });
  it('shows a useful unlinked state without requesting any private-course counts', async () => {
    const { onEditCourses } = mount();
    await waitFor(() => expect(fetchCounts).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('المادة الحالية'), {
      target: { value: 'private' },
    });
    expect(screen.queryByRole('link', { name: /تلاخيص وشروحات/ })).toBeNull();
    expect(fetchCounts).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'تحديد المادة المطابقة' }),
    );
    expect(onEditCourses).toHaveBeenCalledOnce();
  });
  it('removes trusted exam access and counts when the session ends', async () => {
    state.role = 'trusted';
    const { rerender } = mount();
    await waitFor(() =>
      expect(fetchCounts).toHaveBeenCalledWith('python', 'trusted'),
    );
    expect(
      screen.getByRole('link', { name: /امتحانات وسنوات سابقة/ }),
    ).toBeTruthy();
    state.signedIn = false;
    rerender();
    expect(
      screen.queryByRole('link', { name: /امتحانات وسنوات سابقة/ }),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'سجّل الدخول' })).toBeTruthy();
    expect(fetchCounts).toHaveBeenCalledTimes(1);
  });
  it('provides an honest retry state instead of showing zero files on failure', async () => {
    fetchCounts.mockRejectedValueOnce(new Error('offline'));
    mount();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'إعادة المحاولة' }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('link', { name: /تلاخيص وشروحات/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /تلاخيص وشروحات/ })).toBeTruthy(),
    );
    expect(fetchCounts).toHaveBeenCalledTimes(2);
  });
});
