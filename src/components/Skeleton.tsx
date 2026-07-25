export function SubjectCardSkeleton() {
  return (
    <div className="card overflow-hidden p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="h-11 w-11 animate-pulse rounded-xl bg-ink-700/60" />
        <div className="flex gap-1">
          <div className="h-5 w-16 animate-pulse rounded-full bg-ink-700/60" />
        </div>
      </div>
      <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-ink-700/60" />
      <div className="mb-3 h-3 w-1/3 animate-pulse rounded bg-ink-700/40" />
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-ink-700/40" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-ink-700/40" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-5 w-20 animate-pulse rounded-full bg-ink-700/40" />
        <div className="h-3 w-16 animate-pulse rounded bg-ink-700/40" />
      </div>
    </div>
  );
}

export function SubjectCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SubjectCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function FileCardSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-ink-700/60" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink-700/60" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-ink-700/40" />
      </div>
      <div className="flex gap-1">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-ink-700/40" />
        <div className="h-8 w-8 animate-pulse rounded-lg bg-ink-700/40" />
      </div>
    </div>
  );
}

export function FileCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <FileCardSkeleton key={i} />
      ))}
    </div>
  );
}
