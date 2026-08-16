/*
 * A chainable stand-in for the Supabase client used by the service layer.
 * Each `from()` call consumes the next queued response, so a test can drive
 * multi-query services (statistics, cascading deletes) without a real backend.
 */
import { vi } from 'vitest';

export interface StubResponse {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

interface RecordedCall {
  method: string;
  args: unknown[];
}

const DEFAULT_RESPONSE: StubResponse = { data: [], error: null, count: 0 };

export class QueryStub implements PromiseLike<StubResponse> {
  readonly calls: RecordedCall[] = [];

  constructor(readonly table: string, private readonly response: StubResponse) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select(...args: unknown[]): this {
    return this.record('select', args);
  }

  insert(...args: unknown[]): this {
    return this.record('insert', args);
  }

  update(...args: unknown[]): this {
    return this.record('update', args);
  }

  delete(...args: unknown[]): this {
    return this.record('delete', args);
  }

  eq(...args: unknown[]): this {
    return this.record('eq', args);
  }

  in(...args: unknown[]): this {
    return this.record('in', args);
  }

  is(...args: unknown[]): this {
    return this.record('is', args);
  }

  or(...args: unknown[]): this {
    return this.record('or', args);
  }

  contains(...args: unknown[]): this {
    return this.record('contains', args);
  }

  order(...args: unknown[]): this {
    return this.record('order', args);
  }

  range(...args: unknown[]): this {
    return this.record('range', args);
  }

  limit(...args: unknown[]): this {
    return this.record('limit', args);
  }

  maybeSingle(...args: unknown[]): this {
    return this.record('maybeSingle', args);
  }

  single(...args: unknown[]): this {
    return this.record('single', args);
  }

  then<TResult1 = StubResponse, TResult2 = never>(
    onFulfilled?: ((value: StubResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onFulfilled, onRejected);
  }

  /** Arguments of the first call to `method`, or undefined when never called. */
  argsFor(method: string): unknown[] | undefined {
    return this.calls.find((call) => call.method === method)?.args;
  }

  called(method: string): boolean {
    return this.calls.some((call) => call.method === method);
  }
}

export const bucketStub = {
  createSignedUrl: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
};

export const authStub = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
};

const pendingResponses: StubResponse[] = [];
const issuedQueries: QueryStub[] = [];

export const supabaseStub = {
  from: vi.fn((table: string) => {
    const query = new QueryStub(table, pendingResponses.shift() ?? DEFAULT_RESPONSE);
    issuedQueries.push(query);
    return query;
  }),
  rpc: vi.fn(() => Promise.resolve<StubResponse>({ data: null, error: null })),
  storage: { from: vi.fn(() => bucketStub) },
  auth: authStub,
};

/** Queue one response per expected `supabase.from(...)` call, in order. */
export function queueResponses(...responses: StubResponse[]): void {
  pendingResponses.push(...responses);
}

/** The query builders handed out so far, in call order. */
export function issuedQuery(index: number): QueryStub {
  const query = issuedQueries[index];
  if (!query) throw new Error(`No supabase query was issued at index ${index}`);
  return query;
}

export function queryCount(): number {
  return issuedQueries.length;
}

export function resetSupabaseStub(): void {
  pendingResponses.length = 0;
  issuedQueries.length = 0;
  vi.mocked(supabaseStub.rpc).mockReset();
  vi.mocked(supabaseStub.rpc).mockResolvedValue({ data: null, error: null });
  Object.values(bucketStub).forEach((fn) => fn.mockReset());
  Object.values(authStub).forEach((fn) => fn.mockReset());
}
