import { describe, expect, it } from 'vitest';
import { normalizeArabic, smartMatch } from './arabicSearch';

describe('Arabic search normalization', () => {
  it('normalizes alef variants, taa marbuta, and alef maqsura', () => {
    expect(normalizeArabic('إدارة تقنية هُدى')).toBe('اداره تقنيه هدي');
  });

  it('matches Arabic text despite diacritics and common letter variants', () => {
    expect(smartMatch('مُقَدِّمة في إدارة البيانات', 'اداره')).toBe(true);
  });

  it('matches Latin text case-insensitively and accepts an empty query', () => {
    expect(smartMatch('Data Structures', 'data')).toBe(true);
    expect(smartMatch('أي نص', '   ')).toBe(true);
  });
});
