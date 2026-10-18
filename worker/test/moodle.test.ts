import { describe, expect, it } from 'vitest';
import { extractAcademicProfile, extractGeneratedTokenHash, normalizeMoodleCourses, normalizeMoodleMeetings, normalizeStudentId } from '../src/moodle';

describe('Moodle academic authentication input', () => {
  it('normalizes a safe student ID', () => {
    expect(normalizeStudentId('  202612345  ')).toBe('202612345');
    expect(normalizeStudentId('STUDENT.Name')).toBe('student.name');
  });

  it('rejects malformed or ambiguous student IDs', () => {
    expect(normalizeStudentId('')).toBeNull();
    expect(normalizeStudentId('12')).toBeNull();
    expect(normalizeStudentId('student@example.com')).toBeNull();
    expect(normalizeStudentId('../student')).toBeNull();
  });
});

describe('Moodle course normalization', () => {
  it('keeps only valid courses and removes duplicates deterministically', () => {
    expect(normalizeMoodleCourses([
      { id: 10, shortname: 'CS101', fullname: ' Programming ', startdate: 100, visible: 1 },
      { id: 10, shortname: 'CS101', fullname: 'Programming updated', startdate: 100 },
      { id: 11, fullname: '' },
      { id: '12', fullname: 'Invalid ID' },
    ])).toEqual([
      {
        id: 10,
        shortname: 'CS101',
        fullname: 'Programming updated',
        startdate: 100,
        enddate: undefined,
        visible: 1,
      },
    ]);
  });

  it('returns an empty list for a non-array response', () => {
    expect(normalizeMoodleCourses({ exception: 'failure' })).toEqual([]);
  });
});

describe('Moodle recurring meeting normalization', () => {
  it('keeps trusted recurring course patterns and maps them to Amman local time', () => {
    const mondayNineAmman = 1_798_449_600;
    const meetings = normalizeMoodleMeetings([
      { id: 1, courseid: 10, timestart: mondayNineAmman, timeduration: 3600, eventtype: 'course', location: 'قاعة 713' },
      { id: 2, courseid: 10, timestart: mondayNineAmman + 7 * 86_400, timeduration: 3600, eventtype: 'course', location: 'قاعة 713' },
    ], [10]);
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ course_external_id: '10', weekday: 1, room: 'قاعة 713' });
  });

  it('ignores assignments, unknown courses, and one-off events', () => {
    expect(normalizeMoodleMeetings([
      { id: 1, courseid: 10, timestart: 1_798_449_600, timeduration: 3600, modulename: 'assign' },
      { id: 2, courseid: 11, timestart: 1_798_449_600, timeduration: 3600, repeatid: 2 },
      { id: 3, courseid: 10, timestart: 1_798_449_600, timeduration: 3600, eventtype: 'course' },
    ], [10])).toEqual([]);
  });
});

describe('Supabase generated session token response', () => {
  it('accepts the current top-level hashed token response', () => {
    expect(extractGeneratedTokenHash({ hashed_token: 'current-token' })).toBe('current-token');
  });

  it('keeps compatibility with the legacy nested response', () => {
    expect(extractGeneratedTokenHash({ properties: { hashed_token: 'legacy-token' } })).toBe('legacy-token');
  });

  it('rejects missing or empty token hashes', () => {
    expect(extractGeneratedTokenHash({})).toBeNull();
    expect(extractGeneratedTokenHash({ hashed_token: '' })).toBeNull();
  });
});

describe('Moodle profile field extraction', () => {
  it('maps supported standard and custom academic profile fields', () => {
    expect(extractAcademicProfile({
      department: 'علم الحاسوب',
      customfields: [
        { shortname: 'academic_year', value: 'السنة الثالثة' },
        { name: 'الساعات المقطوعة', value: '88 ساعة' },
      ],
    })).toEqual({ academicYear: 'السنة الثالثة', department: 'علم الحاسوب', creditHours: 88 });
  });

  it('does not invent unavailable or invalid profile data', () => {
    expect(extractAcademicProfile({ customfields: [{ shortname: 'credit_hours', value: 'غير معروف' }] }))
      .toEqual({ academicYear: null, department: null, creditHours: null });
  });
});
