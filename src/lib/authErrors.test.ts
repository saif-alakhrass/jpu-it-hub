import { describe, expect, it } from 'vitest';
import { mapAuthError } from './authErrors';

describe('mapAuthError', () => {
  it('maps Supabase auth failures to Arabic messages', () => {
    expect(mapAuthError(new Error('User already registered'))).toContain('مسجل بالفعل');
    expect(mapAuthError(new Error('Password should be at least 6 characters'))).toContain('كلمة المرور ضعيفة');
    expect(mapAuthError(new Error('Unable to validate email address'))).toContain('بريد إلكتروني صحيح');
    expect(mapAuthError(new Error('Email not confirmed'))).toContain('تأكيد بريدك');
    expect(mapAuthError(new Error('Invalid login credentials'))).toContain('غير صحيحة');
    expect(mapAuthError(new Error('User not found'))).toContain('لا يوجد حساب');
    expect(mapAuthError(new Error('For security purposes, you can only request this after 20 seconds'))).toContain('تجاوزت عدد المحاولات');
    expect(mapAuthError(new Error('TypeError: Failed to fetch'))).toContain('تحقق من اتصالك');
    expect(mapAuthError(new Error('The operation timed out'))).toContain('انتهت مهلة');
  });

  it('reads messages out of plain strings and error-shaped objects', () => {
    expect(mapAuthError('invalid credentials')).toContain('غير صحيحة');
    expect(mapAuthError({ message: 'user not found' })).toContain('لا يوجد حساب');
    expect(mapAuthError({ error_description: 'rate limit exceeded' })).toContain('تجاوزت عدد المحاولات');
    expect(mapAuthError({ error: 'email not confirmed' })).toContain('تأكيد بريدك');
    expect(mapAuthError({ msg: 'missing password' })).toContain('كلمة المرور');
  });

  it('treats empty-object errors from retryable fetch failures as network errors', () => {
    const retryable = new Error('{}');
    retryable.name = 'AuthRetryableFetchError';
    expect(mapAuthError(retryable)).toContain('تحقق من اتصالك');
    expect(mapAuthError({ name: 'NetworkError' })).toContain('تحقق من اتصالك');
  });

  it('passes through unrecognised messages and falls back when there is none', () => {
    expect(mapAuthError(new Error('database is on fire'))).toBe('database is on fire');
    expect(mapAuthError(null)).toBe('حدث خطأ أثناء إنشاء الحساب');
    expect(mapAuthError(undefined, 'fallback')).toBe('fallback');
    expect(mapAuthError({}, 'fallback')).toBe('fallback');
    expect(mapAuthError(500, 'fallback')).toBe('500');
    expect(mapAuthError(false, 'fallback')).toBe('false');
  });
});
