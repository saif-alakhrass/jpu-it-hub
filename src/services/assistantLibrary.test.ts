import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requests: [] as {
    columns: string;
    filters: [string, string][];
    head: boolean;
  }[],
  fail: false,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string, options: { head: boolean }) => {
        const request = {
          columns,
          head: options.head,
          filters: [] as [string, string][],
        };
        mocks.requests.push(request);
        const query = {
          eq: (key: string, value: string) => {
            request.filters.push([key, value]);
            return query;
          },
          then: (resolve: (data: unknown) => unknown) =>
            Promise.resolve({
              count: 12,
              error: mocks.fail ? new Error('Unavailable') : null,
            }).then(resolve),
        };
        return query;
      },
    }),
  },
}));
import { fetchAssistantLibraryCounts } from './assistantLibrary';
beforeEach(() => {
  mocks.requests.length = 0;
  mocks.fail = false;
});
describe('assistant library requests', () => {
  it.each([null, 'student'] as const)(
    'does not query exam counters for %s',
    async (role) => {
      const counts = await fetchAssistantLibraryCounts('subject-id', role);
      expect(counts).toEqual({ summaries: 12, slides: 12 });
      for (const request of mocks.requests) {
        expect(request.head).toBe(true);
        expect(request.filters).toContainEqual(['status', 'approved']);
        expect(request.filters).toContainEqual(['subject_id', 'subject-id']);
        expect(request.filters).not.toContainEqual(['tab', 'exams']);
      }
    },
  );
  it('requests permitted exam counts for trusted users', async () => {
    expect(
      (await fetchAssistantLibraryCounts('subject-id', 'trusted')).exams,
    ).toBe(12);
  });
  it('surfaces failures instead of reporting a misleading zero', async () => {
    mocks.fail = true;
    await expect(
      fetchAssistantLibraryCounts('subject-id', 'student'),
    ).rejects.toThrow();
  });
});
