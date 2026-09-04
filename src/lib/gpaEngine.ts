import type { StudentSemester } from './studentAssistant';

export function numeric(
  value: string,
  min: number,
  max: number,
): number | null {
  if (!value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max
    ? result
    : null;
}
export function classifyAverage(average: number) {
  if (average >= 84)
    return { label: 'ممتاز', tone: 'text-emerald-800 bg-emerald-50' };
  if (average >= 76)
    return { label: 'جيد جداً', tone: 'text-brand-800 bg-brand-50' };
  if (average >= 68)
    return { label: 'جيد', tone: 'text-amber-800 bg-amber-50' };
  if (average >= 60)
    return { label: 'مقبول', tone: 'text-orange-800 bg-orange-50' };
  return { label: 'ضعيف — انتبه لمعدلك', tone: 'text-red-800 bg-red-50' };
}
export function calculateGpa(state: StudentSemester) {
  const errors: string[] = [];
  const previousHours = numeric(state.previousHours, 0, 400);
  const previousAverage =
    previousHours === 0 ? 0 : numeric(state.previousAverage, 0, 100);
  if (previousHours === null) errors.push('أدخل ساعات سابقة صحيحة بين 0 و400.');
  if (previousAverage === null) errors.push('أدخل المعدل السابق بين 0 و100.');
  let semesterHours = 0,
    newHours = 0,
    repeatedHours = 0,
    oldPoints = 0,
    points = 0;
  let gradesComplete = true;
  state.courses.forEach((course, index) => {
    const label = course.name.trim() || `المادة ${index + 1}`;
    const hours = numeric(course.hours, 1, 12);
    const grade = numeric(course.grade, 0, 100);
    if (hours === null) {
      errors.push(`ساعات ${label}: أدخل قيمة بين 1 و12.`);
      return;
    }
    semesterHours += hours;
    if (grade === null) gradesComplete = false;
    else points += hours * grade;
    if (course.grade.trim() && grade === null)
      errors.push(`علامة ${label} يجب أن تكون بين 0 و100.`);
    if (course.retake) {
      repeatedHours += hours;
      const oldGrade = numeric(course.oldGrade, 0, 100);
      if (oldGrade === null)
        errors.push(`أدخل العلامة القديمة للمادة المعادة: ${label}.`);
      else oldPoints += hours * oldGrade;
    } else newHours += hours;
  });
  const basePoints = (previousHours ?? 0) * (previousAverage ?? 0);
  if (previousHours !== null && repeatedHours > previousHours)
    errors.push('ساعات المواد المعادة أكبر من الساعات السابقة المحتسبة.');
  const remainingHours = (previousHours ?? 0) - repeatedHours;
  if (
    previousAverage !== null &&
    previousHours !== null &&
    remainingHours >= 0 &&
    (basePoints - oldPoints < -0.00001 ||
      basePoints - oldPoints > remainingHours * 100 + 0.00001)
  )
    errors.push(
      'العلامات القديمة للمواد المعادة لا تتفق مع المعدل والساعات السابقة. راجع بياناتك.',
    );
  const totalHours = (previousHours ?? 0) + newHours;
  const valid = errors.length === 0;
  const maximum =
    valid && totalHours > 0
      ? (basePoints - oldPoints + semesterHours * 100) / totalHours
      : null;
  const target = numeric(state.target, 0, 100);
  const required =
    valid && target !== null && semesterHours > 0
      ? (target * totalHours - basePoints + oldPoints) / semesterHours
      : null;
  return {
    errors,
    semesterHours,
    totalHours,
    gradesComplete,
    semester:
      valid && gradesComplete && semesterHours > 0
        ? points / semesterHours
        : null,
    cumulative:
      valid && gradesComplete && totalHours > 0
        ? (basePoints - oldPoints + points) / totalHours
        : null,
    maximum,
    required,
    targetInvalid: state.target.trim() !== '' && target === null,
  };
}
