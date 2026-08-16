import { Icon } from '@/components/Icon';
import { ROLE_BADGES } from '@/lib/constants';
import type { Role } from '@/lib/types';

interface RoleBadgeProps {
  role: Role;
  className?: string;
  iconClassName?: string;
}

export function RoleBadge({ role, className = '', iconClassName = 'h-3 w-3' }: RoleBadgeProps) {
  const badge = ROLE_BADGES[role] ?? ROLE_BADGES.student;
  return (
    <span className={`badge border ${badge.className} ${className}`}>
      <Icon name={badge.icon} className={iconClassName} />{badge.label}
    </span>
  );
}
