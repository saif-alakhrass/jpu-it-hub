import { describe, expect, it } from 'vitest';
import { COURSE_DETAILS, getCourseMeta } from './courseDetails';

describe('getCourseMeta', () => {
  it('returns the curated entry for a known course', () => {
    expect(getCourseMeta('قواعد البيانات')).toBe(COURSE_DETAILS['قواعد البيانات']);
  });

  it('infers difficulty from name hints for unknown courses', () => {
    expect(getCourseMeta('مقدمة في الروبوتات').difficulty).toBe('سهلة');
    expect(getCourseMeta('الخوارزميات الجينية').difficulty).toBe('صعبة');
    expect(getCourseMeta('مادة اختيارية').difficulty).toBe('متوسطة');
  });

  it('prefers a supplied description and falls back to the generic one', () => {
    expect(getCourseMeta('مادة جديدة', 'وصف مخصص').description).toBe('وصف مخصص');
    expect(getCourseMeta('مادة جديدة', '   ').description).toBe('مادة من مواد كلية تكنولوجيا المعلومات.');
    expect(getCourseMeta('مادة جديدة', null).description).toBe('مادة من مواد كلية تكنولوجيا المعلومات.');
    expect(getCourseMeta('مادة جديدة').description).toBe('مادة من مواد كلية تكنولوجيا المعلومات.');
  });

  it('ignores the fallback description for curated courses', () => {
    expect(getCourseMeta('نظم التشغيل', 'وصف مخصص')).toBe(COURSE_DETAILS['نظم التشغيل']);
  });
});
