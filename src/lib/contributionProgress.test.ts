import { describe, expect, it } from 'vitest';
import { getContributionProgressView } from './contributionProgress';

describe('contribution progress', () => {
  it('keeps a student below the threshold at 19 approved files', () => {
    const progress = getContributionProgressView('student', 19);
    expect(progress.showProgress).toBe(true);
    expect(progress.remainingCount).toBe(1);
    expect(progress.percentage).toBe(95);
  });

  it('marks the twentieth approved contribution as complete', () => {
    const progress = getContributionProgressView('student', 20);
    expect(progress.remainingCount).toBe(0);
    expect(progress.percentage).toBe(100);
  });

  it('does not show unnecessary progress for trusted or admin roles', () => {
    expect(getContributionProgressView('trusted', 20).showProgress).toBe(false);
    expect(getContributionProgressView('admin', 50).showProgress).toBe(false);
  });
});
