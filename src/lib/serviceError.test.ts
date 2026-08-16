import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceError, failService, getUserErrorMessage, unwrapServiceError } from './serviceError';

const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('failService', () => {
  it('throws a ServiceError that keeps the operation and the original cause', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = { code: '23505', message: 'duplicate key' };

    try {
      failService('bookmarks.add', cause);
      expect.unreachable('failService must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).operation).toBe('bookmarks.add');
      expect((error as ServiceError).originalCause).toBe(cause);
    }
  });
});

describe('unwrapServiceError', () => {
  it('returns the wrapped cause, or the error itself when it is not a ServiceError', () => {
    const cause = new Error('boom');
    expect(unwrapServiceError(new ServiceError('files.delete', cause))).toBe(cause);
    expect(unwrapServiceError(cause)).toBe(cause);
  });
});

describe('getUserErrorMessage', () => {
  it('prefers a message that was written for the user', () => {
    const cause = Object.assign(new Error('HTTP 413'), { userMessage: 'الملف كبير جدًا' });
    expect(getUserErrorMessage(new ServiceError('r2.upload', cause), 'تعذر الرفع')).toBe('الملف كبير جدًا');
  });

  it('reports connectivity problems instead of the caller fallback', () => {
    expect(getUserErrorMessage(new TypeError('Failed to fetch'), 'تعذر الحفظ')).toBe(NETWORK_MESSAGE);
    expect(getUserErrorMessage(new ServiceError('files.list', 'request timed out'), 'تعذر الحفظ')).toBe(NETWORK_MESSAGE);
  });

  it('never surfaces a raw database error, falling back to the caller message', () => {
    const dbError = { code: '42501', message: 'new row violates row-level security policy for table "files"' };
    expect(getUserErrorMessage(new ServiceError('files.insert', dbError), 'تعذر الحفظ')).toBe('تعذر الحفظ');
    expect(getUserErrorMessage(undefined, 'تعذر الحفظ')).toBe('تعذر الحفظ');
  });
});
