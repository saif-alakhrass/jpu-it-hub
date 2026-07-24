import type { Difficulty } from '@/lib/courseDetails';

const STYLES: Record<Difficulty, { badge: string; dot: string; label: string }> = {
  سهلة: {
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    dot: 'bg-emerald-400',
    label: 'سهلة',
  },
  متوسطة: {
    badge: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    dot: 'bg-amber-400',
    label: 'متوسطة',
  },
  صعبة: {
    badge: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    dot: 'bg-rose-400',
    label: 'صعبة',
  },
};

export function DifficultyBadge({ difficulty, className = '' }: { difficulty: Difficulty; className?: string }) {
  const s = STYLES[difficulty];
  return (
    <span className={`badge ${s.badge} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
