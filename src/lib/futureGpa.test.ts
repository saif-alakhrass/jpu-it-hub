import { describe, expect, it } from 'vitest';
import { DEGREE_HOURS, planFutureGpa, type FutureGpaInput } from './futureGpa';
import { emptySemester, parseSemester } from './studentAssistant';

const base: FutureGpaInput = {
  previousHours: '30',
  previousAverage: '75',
  target: '84',
  semesterHours: '15',
  average: '90',
};
describe('future GPA with a fixed 132-credit plan', () => {
  it('reaches 84 after three 15-credit semesters averaging 90', () => {
    expect(DEGREE_HOURS).toBe(132);
    expect(planFutureGpa(base)).toMatchObject({
      status: 'reachable',
      semesters: 3,
      added: 45,
      reached: 84,
    });
  });
  it('identifies the 88 credits / 60 average / 90 target as impossible even with perfect marks', () => {
    const result = planFutureGpa({
      ...base,
      previousHours: '88',
      previousAverage: '60',
      target: '90',
      average: '100',
    });
    expect(result.status).toBe('impossible');
    if (result.status !== 'impossible')
      throw new Error('Expected impossible target');
    expect(result.maximum).toBeCloseTo(73.3333333333);
    expect(result.remaining).toBe(44);
  });
  it('distinguishes an insufficient assumed average from an impossible target', () => {
    expect(
      planFutureGpa({ ...base, previousAverage: '80', target: '92' }).status,
    ).toBe('insufficient');
    expect(
      planFutureGpa({ ...base, previousAverage: '80', target: '90' }).status,
    ).toBe('insufficient');
  });
  it('caps the final semester at remaining credits, not an extra full load', () => {
    expect(
      planFutureGpa({
        ...base,
        previousHours: '100',
        previousAverage: '88',
        target: '90',
        semesterHours: '18',
        average: '100',
      }),
    ).toMatchObject({
      status: 'reachable',
      semesters: 2,
      added: 32,
      lastSemesterHours: 14,
    });
  });
  it('reports an already attained target without promising future maintenance', () => {
    const result = planFutureGpa({
      ...base,
      previousAverage: '90',
      average: '60',
    });
    expect(result.status).toBe('achieved');
    if (result.status !== 'achieved')
      throw new Error('Expected achieved target');
    expect(result.projected).toBeLessThan(84);
  });
  it('handles a new student and a fully completed plan', () => {
    expect(
      planFutureGpa({ ...base, previousHours: '0', previousAverage: '' }),
    ).toMatchObject({ status: 'reachable', semesters: 1 });
    expect(planFutureGpa({ ...base, previousHours: '132' })).toMatchObject({
      status: 'impossible',
      remaining: 0,
    });
    expect(
      planFutureGpa({ ...base, previousHours: '132', previousAverage: '90' })
        .status,
    ).toBe('achieved');
  });
  it('does not round a nearly reachable target into success', () => {
    expect(
      planFutureGpa({
        ...base,
        previousHours: '131',
        previousAverage: '89.92',
        target: '90',
        average: '100',
      }).status,
    ).toBe('impossible');
  });
  it.each([
    { previousHours: '133' },
    { previousHours: '-1' },
    { previousAverage: '' },
    { average: '101' },
    { average: 'NaN' },
    { target: 'Infinity' },
    { target: '' },
    { semesterHours: '0' },
    { semesterHours: '31' },
  ])('rejects invalid or inconsistent inputs %j', (patch) => {
    expect(planFutureGpa({ ...base, ...patch }).status).toBe('invalid');
  });
  it('preserves old semester data and validates saved planning inputs', () => {
    const old = emptySemester();
    expect(parseSemester(JSON.stringify(old))).toEqual(old);
    const next = { ...old, futurePlan: { semesterHours: '18', average: '95' } };
    expect(parseSemester(JSON.stringify(next))).toEqual(next);
    expect(() =>
      parseSemester(JSON.stringify({ ...old, futurePlan: { average: 90 } })),
    ).toThrow();
  });
});
