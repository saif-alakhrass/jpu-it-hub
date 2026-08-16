import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issuedQuery, queryCount, queueResponses, resetSupabaseStub, supabaseStub } from '@/test/supabaseStub';
import { ServiceError } from '@/lib/serviceError';
import { fetchNotifications, markNotificationsRead } from './notifications';

vi.mock('@/lib/supabase', () => ({ supabase: supabaseStub, isSupabaseConfigured: true }));

beforeEach(() => {
  resetSupabaseStub();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchNotifications', () => {
  it('returns the newest notifications addressed to the user or to everyone', async () => {
    queueResponses({ data: [{ id: 'n1' }], error: null });

    await expect(fetchNotifications('user-1')).resolves.toEqual([{ id: 'n1' }]);

    const query = issuedQuery(0);
    expect(query.table).toBe('notifications');
    expect(query.argsFor('or')).toEqual(['recipient_id.eq.user-1,recipient_id.is.null']);
    expect(query.argsFor('order')).toEqual(['created_at', { ascending: false }]);
    expect(query.argsFor('limit')).toEqual([20]);
  });

  it('returns an empty inbox when the query yields no rows', async () => {
    queueResponses({ data: null, error: null });

    await expect(fetchNotifications('user-1')).resolves.toEqual([]);
  });

  it('fails loudly when the query errors', async () => {
    queueResponses({ data: null, error: { message: 'permission denied' } });

    await expect(fetchNotifications('user-1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('markNotificationsRead', () => {
  it('stamps read_at only on the unread rows it was given', async () => {
    queueResponses({ data: null, error: null });

    await markNotificationsRead(['n1', 'n2']);

    const query = issuedQuery(0);
    const [update] = query.argsFor('update') as [{ read_at: string }];
    expect(Number.isNaN(Date.parse(update.read_at))).toBe(false);
    expect(query.argsFor('in')).toEqual(['id', ['n1', 'n2']]);
    expect(query.argsFor('is')).toEqual(['read_at', null]);
  });

  it('skips the round trip when there is nothing to mark', async () => {
    await markNotificationsRead([]);

    expect(queryCount()).toBe(0);
  });

  it('fails loudly when the update errors', async () => {
    queueResponses({ data: null, error: { message: 'permission denied' } });

    await expect(markNotificationsRead(['n1'])).rejects.toBeInstanceOf(ServiceError);
  });
});
