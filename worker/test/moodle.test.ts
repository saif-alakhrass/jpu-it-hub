import { describe, expect, it } from 'vitest';
import { AcademicAuthError, applyMoodleDashboardLocations, extractAcademicProfile, extractGeneratedTokenHash, extractMeetingsFromCourseNames, extractMoodleDashboardLocations, mergeSessionCookies, normalizeMoodleCourses, normalizeMoodleMeetings, normalizeStudentId, readJsonResponse, resolveMoodleDashboardUrl } from '../src/moodle';

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
      { id: 1, courseid: 10, timestart: mondayNineAmman, timeduration: 3600, eventtype: 'course', location: 'مبنى الهندسة' },
      { id: 2, courseid: 10, timestart: mondayNineAmman + 7 * 86_400, timeduration: 3600, eventtype: 'course', location: 'مبنى الهندسة' },
    ], [10]);
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ course_external_id: '10', weekday: 1, room: null, location: 'هندسه وحاسوب' });
  });

  it('ignores assignments, unknown courses, and one-off events', () => {
    expect(normalizeMoodleMeetings([
      { id: 1, courseid: 10, timestart: 1_798_449_600, timeduration: 3600, modulename: 'assign' },
      { id: 2, courseid: 11, timestart: 1_798_449_600, timeduration: 3600, repeatid: 2 },
      { id: 3, courseid: 10, timestart: 1_798_449_600, timeduration: 3600, eventtype: 'course' },
    ], [10])).toEqual([]);
  });

  it('falls back safely when Moodle returns its non-IANA default timezone marker', () => {
    const meetings = normalizeMoodleMeetings([
      { id: 1, courseid: 10, timestart: 1_798_449_600, timeduration: 3600, repeatid: 1 },
    ], [10], '99');
    expect(meetings).toHaveLength(1);
  });
});

describe('JPU course-name schedule extraction', () => {
  it('extracts university weekday abbreviations and half-hour notation', () => {
    expect(extractMeetingsFromCourseNames([
      { id: 5743, fullname: 'أمن المعلومات - شعبة (2)(مدمج) / ح ث (8-9.3)' },
      { id: 5707, fullname: 'تحليل وتصميم الخوارزميات - شعبة (2)(وجاهي) / ح ن (12.3-14)' },
      { id: 5708, fullname: 'مادة السبت - مبنى الاعمال / س (10-11)' },
      { id: 5709, fullname: 'مادة ثانية - مبنى هندسة وحاسوب / س (12-13)' },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ course_external_id: '5743', weekday: 0, starts_at: '08:00', ends_at: '09:30' }),
      expect.objectContaining({ course_external_id: '5743', weekday: 2, starts_at: '08:00', ends_at: '09:30' }),
      expect.objectContaining({ course_external_id: '5707', weekday: 1, starts_at: '12:30', ends_at: '14:00' }),
      expect.objectContaining({ course_external_id: '5708', weekday: 6, starts_at: '10:00', location: 'الاعمال' }),
      expect.objectContaining({ course_external_id: '5709', weekday: 6, starts_at: '12:00', location: 'هندسه وحاسوب' }),
    ]));
  });

  it('does not invent meetings for names without a recognized timetable suffix', () => {
    expect(extractMeetingsFromCourseNames([{ id: 1, fullname: 'مادة بدون موعد' }])).toEqual([]);
  });
});

describe('JPU Moodle dashboard location extraction', () => {
  it('replaces an initial Moodle cookie with the authenticated value', () => {
    expect(mergeSessionCookies('MoodleSession=initial', 'MoodleSession=authenticated', 'Other=value'))
      .toBe('MoodleSession=authenticated; Other=value');
  });

  it('keeps dashboard redirects inside the configured Moodle path', () => {
    expect(resolveMoodleDashboardUrl('https://www.jpu.edu.jo/lms', null))
      .toBe('https://www.jpu.edu.jo/lms/my/');
    expect(resolveMoodleDashboardUrl('https://www.jpu.edu.jo/lms', '/lms/my/'))
      .toBe('https://www.jpu.edu.jo/lms/my/');
    expect(resolveMoodleDashboardUrl('https://www.jpu.edu.jo/lms', 'https://evil.example/steal'))
      .toBeNull();
    expect(resolveMoodleDashboardUrl('https://www.jpu.edu.jo/lms', '/outside'))
      .toBeNull();
  });

  it('reads the campus building from the authenticated timetable block', () => {
    const html = `
      <div class="ttcard"><a href="https://www.jpu.edu.jo/lms/course/view.php?id=5743">أمن المعلومات</a>
      <span class="ttmini--building"><i class="fa fa-building"></i> هندسةوحاسوب </span></div>
      <div class="ttcard"><a href="course/view.php?id=5730">تنقيب البيانات</a>
      <span class="ttmini--building"><i></i> الاعمال </span></div>`;
    expect(extractMoodleDashboardLocations(html)).toEqual([
      { course_external_id: '5743', location: 'هندسه وحاسوب' },
      { course_external_id: '5730', location: 'الاعمال' },
    ]);
  });

  it('enriches only a missing and unambiguous meeting location', () => {
    const meetings = [
      { course_external_id: '5743', external_id: 'one', weekday: 0, starts_at: '08:00', ends_at: '08:40', room: null, location: null },
      { course_external_id: '5730', external_id: 'two', weekday: 1, starts_at: '09:00', ends_at: '09:40', room: null, location: 'الغزالي' },
      { course_external_id: '5700', external_id: 'three', weekday: 2, starts_at: '10:00', ends_at: '10:40', room: null, location: null },
    ];
    expect(applyMoodleDashboardLocations(meetings, [
      { course_external_id: '5743', location: 'هندسه وحاسوب' },
      { course_external_id: '5730', location: 'الاعمال' },
      { course_external_id: '5700', location: 'الغزالي' },
      { course_external_id: '5700', location: 'الاعمال' },
    ])).toEqual([
      expect.objectContaining({ external_id: 'one', location: 'هندسه وحاسوب' }),
      expect.objectContaining({ external_id: 'two', location: 'الغزالي' }),
      expect.objectContaining({ external_id: 'three', location: null }),
    ]);
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

describe('upstream JSON response parsing', () => {
  it('accepts an empty successful body only for RPC calls that allow it', async () => {
    await expect(readJsonResponse<null>(new Response(null, { status: 204 }), 'RPC_INVALID', true)).resolves.toBeNull();
  });

  it('keeps Moodle and other required JSON responses strict', async () => {
    await expect(readJsonResponse(new Response('', { status: 200 }), 'MOODLE_INVALID'))
      .rejects.toMatchObject({ code: 'MOODLE_INVALID', status: 502 } satisfies Partial<AcademicAuthError>);
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
