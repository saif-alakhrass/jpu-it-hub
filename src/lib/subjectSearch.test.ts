import { describe, expect, it } from 'vitest';
import { matchSubject, searchSubjects, subjectWords } from './subjectSearch';
import type { Subject } from './types';

const advanced = {
  id: 'advanced',
  name: 'البرمجة المتقدمة',
  code: 'CS201',
  description: 'هياكل البيانات',
  major: 'علم الحاسوب',
} as Subject;
const basics = {
  ...advanced,
  id: 'basics',
  name: 'أساسيات البرمجة',
  code: 'CS101',
};
describe('shared subject search', () => {
  it.each([
    'برمجه متقدمه',
    'متقدمه',
    'المتقدمة برمجة',
    'بَرْمَجَة مُتَقَدِّمَة',
    'البـرمجة   المتقدمه',
  ])('links a unique course for %s', (query) => {
    expect(matchSubject(query, [advanced, basics])).toBe('advanced');
    expect(searchSubjects([advanced, basics], query)[0]?.id).toBe('advanced');
  });
  it('prefers a full folded name but never guesses between partial or duplicate matches', () => {
    const oop = { ...advanced, id: 'oop', name: 'البرمجة الكينونية المتقدمة' };
    expect(matchSubject('برمجه متقدمه', [oop, advanced])).toBe('advanced');
    expect(matchSubject('متقدمه برمجه', [oop, advanced])).toBe('advanced');
    expect(matchSubject('متقدمه', [oop, advanced])).toBeNull();
    expect(searchSubjects([oop, advanced], 'متقدمه')).toHaveLength(2);
    expect(
      matchSubject('برمجه متقدمه', [
        advanced,
        { ...advanced, id: 'duplicate' },
      ]),
    ).toBeNull();
  });
  it('supports code, word prefixes and digits without linking single characters or numeric suffixes', () => {
    expect(matchSubject('cs201', [advanced])).toBe('advanced');
    expect(matchSubject('برم متقد', [advanced])).toBe('advanced');
    expect(matchSubject('ب', [advanced])).toBeNull();
    expect(subjectWords('المشروع ١')).toEqual(['مشروع', '1']);
    expect(searchSubjects([advanced], '201')).toEqual([]);
  });
  it('requires every word and preserves names and academic level numbers', () => {
    expect(searchSubjects([advanced], 'برمجه شبكات')).toEqual([]);
    expect(searchSubjects([advanced], '  ')).toEqual([]);
    const projects = [1, 2].map((n) => ({
      ...advanced,
      id: String(n),
      name: `مشروع التخرج ${n}`,
    }));
    expect(searchSubjects(projects, 'تخرج ٢').map((s) => s.id)).toEqual(['2']);
    expect(advanced.name).toBe('البرمجة المتقدمة');
  });
  it('uses descriptions only for browsing, not automatic linking', () => {
    expect(searchSubjects([advanced], 'هياكل', true)).toEqual([advanced]);
    expect(matchSubject('هياكل', [advanced])).toBeNull();
  });
});
