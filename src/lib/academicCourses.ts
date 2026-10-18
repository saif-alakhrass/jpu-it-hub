import type { StudentSemester, EnrolledCourse, Meeting } from './studentAssistant';
import type { Subject } from './types';
import { subjectWords } from './subjectSearch';

export interface AcademicMeeting {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  location: string | null;
}

export interface AcademicCourseEnrollment {
  id: string;
  externalId: string;
  shortName: string | null;
  fullName: string;
  startAt: string | null;
  endAt: string | null;
  lastSeenAt: string;
  meetings: AcademicMeeting[];
}

function compact(value: string): string {
  return subjectWords(value).join('');
}

export function matchAcademicCourseToSubject(
  course: Pick<AcademicCourseEnrollment, 'fullName' | 'shortName'>,
  subjects: Subject[],
): string | null {
  const academicWords = subjectWords(`${course.shortName ?? ''} ${course.fullName}`);
  const academicCompact = compact(`${course.shortName ?? ''} ${course.fullName}`);
  const ranked = subjects
    .map((subject) => {
      const code = compact(subject.code ?? '');
      const nameWords = subjectWords(subject.name);
      let score = 0;
      if (code.length >= 3 && academicCompact.includes(code)) score = 120 + code.length;
      if (nameWords.length && nameWords.every((word) => academicWords.some((candidate) => candidate.startsWith(word) || word.startsWith(candidate)))) {
        score = Math.max(score, 80 + nameWords.join('').length);
      }
      return { id: subject.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length || (ranked[1] && ranked[1].score === ranked[0]!.score)) return null;
  return ranked[0]!.id;
}

function officialMeetings(course: AcademicCourseEnrollment): Meeting[] {
  const groups = new Map<string, AcademicMeeting[]>();
  for (const meeting of course.meetings) {
    const key = [meeting.startsAt, meeting.endsAt, meeting.room ?? '', meeting.location ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), meeting]);
  }
  return [...groups.values()].map((items) => ({
    id: items[0]!.id,
    days: [...new Set(items.map((item) => item.weekday))].sort(),
    start: items[0]!.startsAt.slice(0, 5),
    end: items[0]!.endsAt.slice(0, 5),
    room: items[0]!.room ?? '',
    building: items[0]!.location ?? '',
  }));
}

function sameCourse(existing: EnrolledCourse, academic: AcademicCourseEnrollment, subjectId: string | null): boolean {
  if (existing.academicCourseId === academic.id) return true;
  if (subjectId && existing.subjectId === subjectId) return true;
  return compact(existing.name) === compact(academic.fullName);
}

export function mergeAcademicCoursesIntoSemester(
  semester: StudentSemester,
  academicCourses: AcademicCourseEnrollment[],
  subjects: Subject[],
): StudentSemester {
  const remaining = semester.courses.filter((course) => !course.academicCourseId);
  const official = academicCourses.map((academic) => {
    const subjectId = matchAcademicCourseToSubject(academic, subjects);
    const existingIndex = semester.courses.findIndex((course) => sameCourse(course, academic, subjectId));
    const existing = existingIndex >= 0 ? semester.courses[existingIndex] : undefined;
    const manualIndex = remaining.findIndex((course) => sameCourse(course, academic, subjectId));
    if (manualIndex >= 0) remaining.splice(manualIndex, 1);
    const syncedMeetings = officialMeetings(academic);
    return {
      ...(existing ?? {
        id: `academic-${academic.id}`,
        hours: '3',
        grade: '',
        retake: false,
        oldGrade: '',
        deadlines: [],
        meetings: [],
      }),
      name: academic.fullName,
      subjectId,
      academicCourseId: academic.id,
      academicSource: 'moodle' as const,
      meetings: syncedMeetings.length ? syncedMeetings : (existing?.meetings ?? []),
    };
  });
  return { ...semester, courses: [...official, ...remaining] };
}
