import { describe, expect, it } from 'vitest';
import { shouldFallbackToSupabase } from './useUpload';

describe('shouldFallbackToSupabase', () => {
  it('allows fallback for infrastructure-style failures', () => {
    expect(shouldFallbackToSupabase('تعذر الاتصال بخدمة الملفات (500)')).toBe(true);
    expect(shouldFallbackToSupabase('Internal server error')).toBe(true);
  });

  it('blocks fallback for non-recoverable upload policy failures', () => {
    expect(shouldFallbackToSupabase('Duplicate file: a file with this hash already exists in this subject')).toBe(false);
    expect(shouldFallbackToSupabase('File too large: maximum 20 MB')).toBe(false);
    expect(shouldFallbackToSupabase('Missing authorization token')).toBe(false);
  });
});
