export interface Meeting {
  id: string;
  days: number[];
  start: string;
  end: string;
}
export interface Deadline {
  id: string;
  title: string;
  kind: 'midterm' | 'final' | 'project';
  at: string;
}
export interface EnrolledCourse {
  id: string;
  name: string;
  subjectId: string | null;
  hours: string;
  grade: string;
  retake: boolean;
  oldGrade: string;
  meetings: Meeting[];
  deadlines: Deadline[];
}
export interface StudentSemester {
  version: 1;
  name: string;
  major: string;
  previousAverage: string;
  previousHours: string;
  target: string;
  startsOn: string;
  endsOn: string;
  courses: EnrolledCourse[];
}
export const STUDENT_STORAGE_KEY = 'jpu-it-hub:student-semester:v1';
export const MAX_COURSES = 30;
export function emptySemester(): StudentSemester {
  return {
    version: 1,
    name: '',
    major: '',
    previousAverage: '',
    previousHours: '0',
    target: '80',
    startsOn: '',
    endsOn: '',
    courses: [],
  };
}
export function newCourse(): EnrolledCourse {
  return {
    id: crypto.randomUUID(),
    name: '',
    subjectId: null,
    hours: '3',
    grade: '',
    retake: false,
    oldGrade: '',
    meetings: [],
    deadlines: [],
  };
}

// Treat local storage as untrusted input. Preserve incomplete form strings, but
// never accept arbitrary object shapes, duplicate identities or oversized data.
export function parseSemester(raw: string): StudentSemester {
  if (raw.length > 250_000) throw new Error('Semester is too large');
  const value: unknown = JSON.parse(raw);
  const obj = (x: unknown): x is Record<string, unknown> =>
    Boolean(x) && typeof x === 'object' && !Array.isArray(x);
  const str = (x: unknown, max = 160): x is string =>
    typeof x === 'string' && x.length <= max;
  const id = (x: unknown): x is string =>
    str(x, 80) && /^[a-zA-Z0-9-]+$/.test(x);
  const unique = (xs: { id: string }[]) =>
    new Set(xs.map((x) => x.id)).size === xs.length;
  if (
    !obj(value) ||
    value.version !== 1 ||
    ![
      'name',
      'major',
      'previousAverage',
      'previousHours',
      'target',
      'startsOn',
      'endsOn',
    ].every((k) => str(value[k])) ||
    !Array.isArray(value.courses) ||
    value.courses.length > MAX_COURSES
  )
    throw new Error('Invalid semester');
  for (const c of value.courses) {
    if (
      !obj(c) ||
      !id(c.id) ||
      !['name', 'hours', 'grade', 'oldGrade'].every((k) => str(c[k])) ||
      typeof c.retake !== 'boolean' ||
      !(c.subjectId === null || id(c.subjectId)) ||
      !Array.isArray(c.meetings) ||
      c.meetings.length > 10 ||
      !Array.isArray(c.deadlines) ||
      c.deadlines.length > 20
    )
      throw new Error('Invalid course');
    for (const m of c.meetings) {
      if (
        !obj(m) ||
        !id(m.id) ||
        !str(m.start, 5) ||
        !str(m.end, 5) ||
        !Array.isArray(m.days) ||
        m.days.length > 7 ||
        m.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) ||
        new Set(m.days).size !== m.days.length
      )
        throw new Error('Invalid meeting');
    }
    for (const d of c.deadlines) {
      if (
        !obj(d) ||
        !id(d.id) ||
        !str(d.title) ||
        !str(d.at, 16) ||
        !['midterm', 'final', 'project'].includes(String(d.kind))
      )
        throw new Error('Invalid deadline');
    }
    if (!unique(c.meetings as Meeting[]) || !unique(c.deadlines as Deadline[]))
      throw new Error('Duplicate event');
  }
  if (!unique(value.courses as EnrolledCourse[]))
    throw new Error('Duplicate course');
  return value as unknown as StudentSemester;
}
