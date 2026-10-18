import { describe, expect, it } from 'vitest';
import { extractGeneratedTokenHash, normalizeMoodleCourses, normalizeStudentId } from '../src/moodle';

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
