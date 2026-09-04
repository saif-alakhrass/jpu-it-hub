import { describe, expect, it } from 'vitest';
import { calculateGpa, classifyAverage } from './gpaEngine';
import { emptySemester, newCourse } from './studentAssistant';

describe('percentage GPA engine', () => {
  it('uses credit-weighted averages rather than averaging course marks', () => {
    const result = calculateGpa({
      ...emptySemester(),
      previousHours: '30',
      previousAverage: '70',
      courses: [
        { ...newCourse(), hours: '3', grade: '90' },
        { ...newCourse(), hours: '1', grade: '50' },
      ],
    });
    expect(result.semester).toBe(80);
    expect(result.cumulative).toBeCloseTo(2420 / 34, 8);
  });
  it('replaces retake points without adding its credits twice', () => {
    const result = calculateGpa({
      ...emptySemester(),
      previousHours: '30',
      previousAverage: '70',
      courses: [
        {
          ...newCourse(),
          hours: '3',
          grade: '90',
          retake: true,
          oldGrade: '50',
        },
        { ...newCourse(), hours: '3', grade: '80' },
      ],
    });
    expect(result.semesterHours).toBe(6);
    expect(result.totalHours).toBe(33);
    expect(result.semester).toBe(85);
    expect(result.cumulative).toBeCloseTo(2460 / 33, 8);
  });
  it('also uses a lower expected retake mark (not an implicit highest-grade policy)', () => {
    const result = calculateGpa({
      ...emptySemester(),
      previousHours: '3',
      previousAverage: '80',
      courses: [{ ...newCourse(), grade: '60', retake: true, oldGrade: '80' }],
    });
    expect(result.cumulative).toBe(60);
    expect(result.totalHours).toBe(3);
  });
  it('computes feasible and impossible targets without needing expected grades', () => {
    const base = {
      ...emptySemester(),
      previousHours: '30',
      previousAverage: '70',
      target: '75',
      courses: [{ ...newCourse(), hours: '15' }],
    };
    // Invalid per-course credits never silently enter the calculations.
    expect(calculateGpa(base).required).toBeNull();
    base.courses = [
      { ...newCourse(), hours: '6' },
      { ...newCourse(), hours: '9' },
    ];
    expect(calculateGpa(base).required).toBe(85);
    expect(calculateGpa({ ...base, target: '95' }).required).toBe(145);
    expect(calculateGpa({ ...base, target: '95' }).maximum).toBe(80);
    expect(calculateGpa({ ...base, target: '40' }).required).toBeLessThan(0);
  });
  it('includes retake removal in the target formula', () => {
    const result = calculateGpa({
      ...emptySemester(),
      previousHours: '30',
      previousAverage: '70',
      target: '74',
      courses: [{ ...newCourse(), retake: true, oldGrade: '50' }],
    });
    expect(result.required).toBe(90);
    expect(result.maximum).toBe(75);
  });
  it('distinguishes missing marks from real zero marks', () => {
    expect(
      calculateGpa({ ...emptySemester(), courses: [newCourse()] }).cumulative,
    ).toBeNull();
    expect(
      calculateGpa({
        ...emptySemester(),
        courses: [{ ...newCourse(), grade: '0' }],
      }).cumulative,
    ).toBe(0);
    expect(calculateGpa(emptySemester()).semester).toBeNull();
  });
  it.each(['-1', '101', 'NaN', 'Infinity'])(
    'rejects invalid grade %s',
    (grade) => {
      expect(
        calculateGpa({
          ...emptySemester(),
          courses: [{ ...newCourse(), grade }],
        }).errors.length,
      ).toBeGreaterThan(0);
    },
  );
  it('rejects inconsistent previous hours/points and retakes', () => {
    expect(
      calculateGpa({
        ...emptySemester(),
        courses: [{ ...newCourse(), retake: true, oldGrade: '50' }],
      }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      calculateGpa({
        ...emptySemester(),
        previousHours: '3',
        previousAverage: '90',
        courses: [{ ...newCourse(), retake: true, oldGrade: '20' }],
      }).errors.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    [84, 'ممتاز'],
    [83.99, 'جيد جداً'],
    [76, 'جيد جداً'],
    [75.99, 'جيد'],
    [68, 'جيد'],
    [67.99, 'مقبول'],
    [60, 'مقبول'],
    [59.99, 'ضعيف — انتبه لمعدلك'],
  ])('classifies %s at the unrounded boundary', (value, label) => {
    expect(classifyAverage(value as number).label).toBe(label);
  });
});
