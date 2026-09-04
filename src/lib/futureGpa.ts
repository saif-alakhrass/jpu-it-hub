import { numeric } from './gpaEngine';
export const DEGREE_HOURS = 132;

export interface FutureGpaInput {
  previousHours: string;
  previousAverage: string;
  target: string;
  semesterHours: string;
  average: string;
}

/** New, GPA-bearing credits only. Retakes and university rounding are excluded. */
export function planFutureGpa(input: FutureGpaInput) {
  const hours = numeric(input.previousHours, 0, 400);
  const current = hours === 0 ? 0 : numeric(input.previousAverage, 0, 100);
  const total = DEGREE_HOURS;
  const load = numeric(input.semesterHours, 1, 30);
  const average = numeric(input.average, 0, 100);
  const target = numeric(input.target, 0, 100);
  if (
    hours === null ||
    current === null ||
    load === null ||
    average === null ||
    target === null
  ) {
    return {
      status: 'invalid' as const,
      message:
        'أكمل الساعات والمعدلات بقيم صحيحة؛ المعدلات من 0 إلى 100 وساعات الفصل من 1 إلى 30.',
    };
  }
  if (hours > total) {
    return {
      status: 'invalid' as const,
      message:
        'الساعات السابقة أكبر من ساعات الخطة. راجع القيم قبل حساب الفصول.',
    };
  }
  const remaining = total - hours;
  const points = hours * current;
  const maximum = (points + remaining * 100) / total;
  const projected = (points + remaining * average) / total;
  const required = remaining > 0 ? (target * total - points) / remaining : null;
  const stats = { remaining, maximum, projected, required };
  if (hours > 0 && current >= target) {
    return { ...stats, status: 'achieved' as const };
  }
  // Compare unrounded values. Tolerance only absorbs floating-point arithmetic.
  const epsilon = 1e-9;
  if (maximum + epsilon < target || remaining === 0) {
    return { ...stats, status: 'impossible' as const };
  }
  if (projected + epsilon < target) {
    return { ...stats, status: 'insufficient' as const };
  }
  let added = 0;
  let semesters = 0;
  let reached = current;
  let lastSemesterHours = 0;
  // Bounded by at most 132 semesters; the last semester uses remaining credits.
  while (added < remaining) {
    lastSemesterHours = Math.min(load, remaining - added);
    added += lastSemesterHours;
    semesters++;
    reached = (points + added * average) / (hours + added);
    if (reached + epsilon >= target) break;
  }
  return {
    ...stats,
    status: 'reachable' as const,
    semesters,
    reached,
    added,
    lastSemesterHours,
  };
}
