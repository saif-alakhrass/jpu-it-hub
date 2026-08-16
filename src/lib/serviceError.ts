/**
 * Shared error plumbing for the service layer.
 *
 * Services never return a bare `false`/`null` to signal failure: they throw a
 * `ServiceError` that keeps the original cause attached, so the console shows
 * what actually went wrong while the UI shows an Arabic message.
 */

/** An error that already carries a message safe to show to the user. */
export interface UserFacingError {
  userMessage: string;
}

function isUserFacingError(error: unknown): error is UserFacingError {
  return typeof error === 'object'
    && error !== null
    && typeof (error as { userMessage?: unknown }).userMessage === 'string'
    && (error as UserFacingError).userMessage.trim().length > 0;
}

export class ServiceError extends Error {
  readonly operation: string;
  readonly originalCause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`Service operation failed: ${operation}`);
    this.name = 'ServiceError';
    this.operation = operation;
    this.originalCause = cause;
  }
}

export function failService(operation: string, cause: unknown): never {
  console.error(`Service operation failed: ${operation}`, cause);
  throw new ServiceError(operation, cause);
}

/** Returns the underlying cause of a `ServiceError`, or the error itself. */
export function unwrapServiceError(error: unknown): unknown {
  return error instanceof ServiceError ? error.originalCause : error;
}

const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.';

const NETWORK_PATTERNS = /fetch failed|failed to fetch|networkerror|network request failed|load failed|offline|err_internet|timeout|timed out|aborted/i;

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; name?: unknown };
    return [candidate.name, candidate.message].filter((part) => typeof part === 'string').join(' ');
  }
  return '';
}

function isNetworkFailure(error: unknown): boolean {
  if (NETWORK_PATTERNS.test(messageOf(error))) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Picks the message to show for a failed operation: an error that was built for
 * the user wins, connectivity problems get a dedicated message, and anything
 * else falls back to the caller's context-specific text (raw database errors
 * are never surfaced).
 */
export function getUserErrorMessage(error: unknown, fallback: string): string {
  const cause = unwrapServiceError(error);
  if (isUserFacingError(cause)) return cause.userMessage;
  if (isNetworkFailure(cause)) return NETWORK_MESSAGE;
  return fallback;
}
