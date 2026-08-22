import type { Role } from '@/lib/types';

export const TRUSTED_CONTRIBUTION_TARGET = 20;

export interface ContributionProgressView {
  approvedCount: number;
  targetCount: number;
  remainingCount: number;
  percentage: number;
  showProgress: boolean;
  message: string;
}

export function getContributionProgressView(role: Role, approvedCount: number): ContributionProgressView {
  const count = Math.max(0, Math.floor(approvedCount));
  const remaining = Math.max(TRUSTED_CONTRIBUTION_TARGET - count, 0);

  if (role === 'admin') {
    return {
      approvedCount: count,
      targetCount: TRUSTED_CONTRIBUTION_TARGET,
      remainingCount: 0,
      percentage: 100,
      showProgress: false,
      message: 'حسابك يحمل صلاحيات الإدارة.',
    };
  }

  if (role === 'trusted') {
    return {
      approvedCount: count,
      targetCount: TRUSTED_CONTRIBUTION_TARGET,
      remainingCount: 0,
      percentage: 100,
      showProgress: false,
      message: 'وصلت إلى رتبة موثوق ويمكنك الوصول إلى السنوات السابقة.',
    };
  }

  return {
    approvedCount: count,
    targetCount: TRUSTED_CONTRIBUTION_TARGET,
    remainingCount: remaining,
    percentage: Math.min((count / TRUSTED_CONTRIBUTION_TARGET) * 100, 100),
    showProgress: true,
    message: remaining === 0
      ? 'اكتملت مساهماتك، وسيتم تحديث رتبتك تلقائيًا.'
      : `تبقى ${remaining} ${remaining === 1 ? 'ملف معتمد' : 'ملفات معتمدة'} للوصول إلى رتبة موثوق.`,
  };
}
