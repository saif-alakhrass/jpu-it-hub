import type { Difficulty } from '@/lib/courseDetails';

const STYLES: Record<Difficulty, { badge: string; dot: string; label: string }> = {
  سهلة: {
    badge: 'bg-sky-100 text-sky-700 border border-sky-200',
    dot: 'bg-sky-500',
    label: 'سهلة',
  },
  متوسطة: {
    badge: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    dot: 'bg-indigo-500',
    label: 'متوسطة',
  },
  صعبة: {
    badge: 'bg-violet-100 text-violet-700 border border-violet-200',
    dot: 'bg-violet-500',
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
