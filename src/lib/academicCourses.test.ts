import { describe, expect, it } from 'vitest';
import { emptySemester, newCourse } from './studentAssistant';
import { matchAcademicCourseToSubject, mergeAcademicCoursesIntoSemester, type AcademicCourseEnrollment } from './academicCourses';
import type { Subject } from './types';

const subjects = [
  { id: 's1', name: 'البرمجة المتقدمة', code: 'CS301' },
  { id: 's2', name: 'شبكات الحاسوب', code: 'CS240' },
] as Subject[];

const academic = (overrides: Partial<AcademicCourseEnrollment> = {}): AcademicCourseEnrollment => ({
  id: '11111111-1111-1111-1111-111111111111', externalId: '10', shortName: 'CS301-1',
  fullName: 'البرمجة المتقدمة - شعبة 1', startAt: null, endAt: null,
  lastSeenAt: '2026-10-18T00:00:00Z', meetings: [], ...overrides,
});

describe('academic course matching and assistant hydration', () => {
  it('matches a Moodle course by code even with a section suffix', () => {
    expect(matchAcademicCourseToSubject(academic(), subjects)).toBe('s1');
  });

  it('adds official courses while preserving manual entries', () => {
    const manual = { ...newCourse(), id: 'manual-1', name: 'مادة خاصة' };
    const result = mergeAcademicCoursesIntoSemester({ ...emptySemester(), courses: [manual] }, [academic()], subjects);
    expect(result.courses).toHaveLength(2);
    expect(result.courses[0]).toMatchObject({ academicSource: 'moodle', subjectId: 's1', name: academic().fullName });
    expect(result.courses[1]).toEqual(manual);
  });

  it('preserves user grades and groups official meeting days', () => {
    const existing = {
      ...newCourse(), id: 'academic-11111111-1111-1111-1111-111111111111',
      academicCourseId: academic().id, academicSource: 'moodle' as const, grade: '91',
    };
    const result = mergeAcademicCoursesIntoSemester(
      { ...emptySemester(), courses: [existing] },
      [academic({ meetings: [
        { id: 'm1', weekday: 1, startsAt: '09:00:00', endsAt: '10:00:00', room: '713', location: 'IT' },
        { id: 'm2', weekday: 3, startsAt: '09:00:00', endsAt: '10:00:00', room: '713', location: 'IT' },
      ] })],
      subjects,
    );
    expect(result.courses[0]!.grade).toBe('91');
    expect(result.courses[0]!.meetings[0]).toMatchObject({ days: [1, 3], start: '09:00', room: '713' });
  });

  it('preserves an optional room and selected campus when Moodle only supplies time', () => {
    const existing = {
      ...newCourse(), academicCourseId: academic().id, academicSource: 'moodle' as const,
      meetings: [{ id: 'old', days: [0, 2], start: '08:00', end: '09:30', building: 'الغزالي', room: '204' }],
    };
    const result = mergeAcademicCoursesIntoSemester(
      { ...emptySemester(), courses: [existing] },
      [academic({ meetings: [
        { id: 'new-1', weekday: 0, startsAt: '08:00:00', endsAt: '09:30:00', room: null, location: null },
        { id: 'new-2', weekday: 2, startsAt: '08:00:00', endsAt: '09:30:00', room: null, location: null },
      ] })],
      subjects,
    );
    expect(result.courses[0]!.meetings[0]).toMatchObject({ building: 'الغزالي', room: '204' });
  });
});
