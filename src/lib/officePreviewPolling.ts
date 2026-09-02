import type { OfficePreviewResult } from './officePreviewApi';

export const OFFICE_PREVIEW_MAX_ATTEMPTS = 60;

type PendingStatus = Extract<OfficePreviewResult, { status: 'queued' | 'processing' }>;
type FinalStatus = Exclude<OfficePreviewResult, PendingStatus> | { status: 'timeout' };

interface PollOfficePreviewOptions {
  signal: AbortSignal;
  request: (signal: AbortSignal) => Promise<OfficePreviewResult>;
  onPending?: (status: PendingStatus['status']) => void;
  maxAttempts?: number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

export function waitForOfficePreview(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const cancel = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(abortError());
    };
    const timer = window.setTimeout(finish, milliseconds);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * Polls one immutable Office preview request. Cancellation is checked both
 * before and after every network request so a stale file can never publish a
 * state transition after the dialog closes or another file is opened.
 */
export async function pollOfficePreview({
  signal,
  request,
  onPending,
  maxAttempts = OFFICE_PREVIEW_MAX_ATTEMPTS,
  wait = waitForOfficePreview,
}: PollOfficePreviewOptions): Promise<FinalStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal.aborted) throw abortError();
    const result = await request(signal);
    if (signal.aborted) throw abortError();
    if (result.status === 'ready' || result.status === 'failed') return result;
    onPending?.(result.status);
    const seconds = Math.max(2, Math.min(result.retryAfterSeconds, 10));
    await wait(seconds * 1000, signal);
  }
  return { status: 'timeout' };
}
