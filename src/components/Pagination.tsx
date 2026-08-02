import { Icon } from '@/components/Icon';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageRange(page, totalPages);

  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="ترقيم الصفحات">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        className="grid h-9 w-9 place-items-center rounded-lg border border-white/5 bg-ink-800 text-slate-300 transition hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="الصفحة السابقة"
      >
        <Icon name="ChevronLeft" className="h-4 w-4" />
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-500">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`الصفحة ${p + 1}`}
            className={`grid h-9 min-w-9 place-items-center rounded-lg px-3 text-sm font-bold transition ${
              p === page
                ? 'bg-brand-500 text-ink-950'
                : 'border border-white/5 bg-ink-800 text-slate-300 hover:bg-ink-700'
            }`}
          >
            {p + 1}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="grid h-9 w-9 place-items-center rounded-lg border border-white/5 bg-ink-800 text-slate-300 transition hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="الصفحة التالية"
      >
        <Icon name="ChevronRight" className="h-4 w-4" />
      </button>
    </nav>
  );
}

function getPageRange(current: number, total: number): (number | '...')[] {
  const result: (number | '...')[] = [];
  const maxButtons = 5;

  if (total <= maxButtons + 2) {
    for (let i = 0; i < total; i++) result.push(i);
    return result;
  }

  result.push(0);
  const start = Math.max(1, current - 1);
  const end = Math.min(total - 2, current + 1);

  if (start > 1) result.push('...');
  for (let i = start; i <= end; i++) result.push(i);
  if (end < total - 2) result.push('...');
  result.push(total - 1);

  return result;
}
