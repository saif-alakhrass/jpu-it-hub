import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
  children?: ReactNode;
}

export function EmptyState({ icon, title, message, ctaLabel, onCta, children }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center p-12 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-ink-700/40 border border-white/5">
        <Icon name={icon} className="h-8 w-8 text-slate-500" />
      </div>
      <h3 className="mb-1 text-lg font-bold text-slate-200">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-slate-400">{message}</p>
      {ctaLabel && onCta && (
        <button onClick={onCta} className="btn-primary">
          <Icon name="Upload" className="h-4 w-4" />
          {ctaLabel}
        </button>
      )}
      {children}
    </div>
  );
}
