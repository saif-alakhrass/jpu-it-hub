import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceError, failService, getUserErrorMessage } from './serviceError';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('failService', () => {
  it('logs the failure and throws a ServiceError carrying the cause', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = { code: '42501' };

    try {
      failService('fetch files', cause);
      expect.unreachable('failService must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      const serviceError = error as ServiceError;
      expect(serviceError.name).toBe('ServiceError');
      expect(serviceError.message).toBe('Service operation failed: fetch files');
      expect(serviceError.operation).toBe('fetch files');
      expect(serviceError.originalCause).toBe(cause);
    }

    expect(consoleError).toHaveBeenCalledWith('Service operation failed: fetch files', cause);
  });
});

describe('getUserErrorMessage', () => {
  it('never leaks backend details to the UI', () => {
    expect(getUserErrorMessage(new Error('permission denied for table files'), 'تعذر تحميل الملفات')).toBe('تعذر تحميل الملفات');
    expect(getUserErrorMessage(null, 'تعذر تحميل الملفات')).toBe('تعذر تحميل الملفات');
  });
});
