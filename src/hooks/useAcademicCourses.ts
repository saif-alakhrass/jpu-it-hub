import { useQuery } from '@tanstack/react-query';
import { fetchMyAcademicCourses } from '@/services/academicCourses';

export function useAcademicCourses(userId?: string) {
  const query = useQuery({
    queryKey: ['academic-courses', userId ?? 'anonymous'],
    queryFn: () => fetchMyAcademicCourses(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
  return {
    courses: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    reload: query.refetch,
  };
}
