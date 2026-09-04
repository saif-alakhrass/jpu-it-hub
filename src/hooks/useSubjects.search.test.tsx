import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), paged: vi.fn() }));
vi.mock('@/services/subjects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/subjects')>()),
  fetchAllSubjects: mocks.catalog,
  fetchSubjectsPaged: mocks.paged,
}));
import { useSubjectsPaged } from './useSubjects';
afterEach(cleanup);
describe('cached general subject search', () => {
  it('reuses one catalog request across search edits and filters', async () => {
    mocks.catalog.mockReset().mockResolvedValue([
      { id: '1', name: 'البرمجة المتقدمة', departments: ['علم الحاسوب'] },
      { id: '2', name: 'شبكات الحاسوب', departments: ['علم الحاسوب'] },
    ]);
    mocks.paged.mockReset();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ search, major }) => useSubjectsPaged(search, major),
      {
        wrapper,
        initialProps: { search: 'برمجه متقدمه', major: 'علم الحاسوب' },
      },
    );
    await waitFor(() => expect(result.current.data.items[0]?.id).toBe('1'));
    rerender({ search: 'شبكات', major: 'علم الحاسوب' });
    await waitFor(() => expect(result.current.data.items[0]?.id).toBe('2'));
    rerender({ search: 'شبكات', major: 'الأمن السيبراني' });
    await waitFor(() => expect(result.current.data.total).toBe(0));
    expect(mocks.catalog).toHaveBeenCalledOnce();
    expect(mocks.paged).not.toHaveBeenCalled();
  });
});
