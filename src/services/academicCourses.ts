import { supabase } from '@/lib/supabase';
import type { AcademicCourseEnrollment, AcademicMeeting } from '@/lib/academicCourses';
import { failService } from '@/lib/serviceError';

interface EnrollmentRow {
  course_id: string;
  last_seen_at: string;
  course: {
    id: string;
    external_id: string;
    short_name: string | null;
    full_name: string;
    start_at: string | null;
    end_at: string | null;
  } | null;
}

interface MeetingRow {
  id: string;
  course_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  room: string | null;
  location: string | null;
}

export async function fetchMyAcademicCourses(userId: string): Promise<AcademicCourseEnrollment[]> {
  const [{ data: enrollmentData, error: enrollmentError }, { data: meetingData, error: meetingError }] = await Promise.all([
    supabase
      .from('student_enrollments')
      .select('course_id, last_seen_at, course:academic_courses!student_enrollments_course_id_fkey(id, external_id, short_name, full_name, start_at, end_at)')
      .eq('user_id', userId)
      .eq('term_key', 'current')
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false }),
    supabase
      .from('course_meetings')
      .select('id, course_id, weekday, starts_at, ends_at, room, location')
      .eq('enrollment_user_id', userId)
      .order('weekday')
      .order('starts_at'),
  ]);
  if (enrollmentError) failService('fetch academic enrollments', enrollmentError);
  if (meetingError) failService('fetch academic meetings', meetingError);

  const meetings = new Map<string, AcademicMeeting[]>();
  for (const row of (meetingData ?? []) as MeetingRow[]) {
    const item: AcademicMeeting = {
      id: row.id,
      weekday: row.weekday,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      room: row.room,
      location: row.location,
    };
    meetings.set(row.course_id, [...(meetings.get(row.course_id) ?? []), item]);
  }
  return ((enrollmentData ?? []) as unknown as EnrollmentRow[])
    .filter((row) => row.course)
    .map((row) => ({
      id: row.course!.id,
      externalId: row.course!.external_id,
      shortName: row.course!.short_name,
      fullName: row.course!.full_name,
      startAt: row.course!.start_at,
      endAt: row.course!.end_at,
      lastSeenAt: row.last_seen_at,
      meetings: meetings.get(row.course_id) ?? [],
    }));
}
