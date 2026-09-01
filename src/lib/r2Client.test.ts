import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestOfficePreview } from './r2Client';

describe('requestOfficePreview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns queued state and clamps the polling delay', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'queued',
      retry_after_seconds: 60,
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestOfficePreview('token', 'file-id')).resolves.toEqual({
      status: 'queued',
      retryAfterSeconds: 10,
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/office-preview'), expect.objectContaining({ method: 'POST' }));
  });

  it('returns the generated private PDF bytes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-preview', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })));

    const result = await requestOfficePreview('token', 'file-id');
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.pdf.type).toBe('application/pdf');
      expect(await result.pdf.text()).toBe('%PDF-preview');
    }
  });

  it('returns a safe failed conversion state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'failed', error_code: 'conversion_failed',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })));

    await expect(requestOfficePreview('token', 'file-id')).resolves.toEqual({
      status: 'failed', errorCode: 'conversion_failed',
    });
  });
});
