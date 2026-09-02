import { describe, expect, it, vi } from 'vitest';
import { pollOfficePreview } from './officePreviewPolling';

describe('Office preview polling lifecycle', () => {
  it('reports queued/processing and returns the ready PDF', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 'queued', retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ status: 'processing', retryAfterSeconds: 99 })
      .mockResolvedValueOnce({ status: 'ready', pdf });
    const onPending = vi.fn();
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await pollOfficePreview({ signal: new AbortController().signal, request, onPending, wait });

    expect(result).toEqual({ status: 'ready', pdf });
    expect(onPending.mock.calls).toEqual([['queued'], ['processing']]);
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2000, 10000]);
  });

  it('stops immediately when the dialog closes during conversion', async () => {
    const controller = new AbortController();
    const request = vi.fn().mockResolvedValue({ status: 'queued', retryAfterSeconds: 2 });
    const wait = vi.fn((_milliseconds: number, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const polling = pollOfficePreview({ signal: controller.signal, request, wait });

    await Promise.resolve();
    controller.abort();

    await expect(polling).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('returns a failed conversion without another poll', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'failed', errorCode: 'conversion_failed' });
    const result = await pollOfficePreview({ signal: new AbortController().signal, request });
    expect(result).toEqual({ status: 'failed', errorCode: 'conversion_failed' });
    expect(request).toHaveBeenCalledOnce();
  });

  it('enforces a hard attempt limit', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'processing', retryAfterSeconds: 2 });
    const result = await pollOfficePreview({
      signal: new AbortController().signal,
      request,
      maxAttempts: 2,
      wait: vi.fn().mockResolvedValue(undefined),
    });
    expect(result).toEqual({ status: 'timeout' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not publish a stale response after switching away from a file', async () => {
    const controller = new AbortController();
    let resolveRequest!: (value: { status: 'queued'; retryAfterSeconds: number }) => void;
    const request = vi.fn(() => new Promise<{ status: 'queued'; retryAfterSeconds: number }>((resolve) => { resolveRequest = resolve; }));
    const onPending = vi.fn();
    const polling = pollOfficePreview({ signal: controller.signal, request, onPending });
    controller.abort();
    resolveRequest({ status: 'queued', retryAfterSeconds: 2 });

    await expect(polling).rejects.toMatchObject({ name: 'AbortError' });
    expect(onPending).not.toHaveBeenCalled();
  });
});
