import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOfficePreviewStrategy, requestOfficePreview } from './officePreviewApi';

describe('Office preview storage compatibility', () => {
  it('uses conversion only for R2 files with a valid source key', () => {
    expect(getOfficePreviewStrategy({ storage_provider: 'r2', object_key: 'user/lecture.pptx' })).toBe('r2-conversion');
    expect(getOfficePreviewStrategy({ storage_provider: 'r2', object_key: null })).toBe('legacy-fallback');
  });

  it.each(['pptx', 'docx'])('keeps legacy Supabase %s files on the safe fallback path', () => {
    expect(getOfficePreviewStrategy({ storage_provider: 'supabase', object_key: null })).toBe('legacy-fallback');
  });
});

describe('requestOfficePreview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns queued state and clamps the polling delay', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'queued', retry_after_seconds: 60,
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestOfficePreview('token', 'file-id')).resolves.toEqual({
      status: 'queued', retryAfterSeconds: 10,
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/office-preview'), expect.objectContaining({ method: 'POST' }));
  });

  it('returns processing state with a minimum polling delay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'processing', retry_after_seconds: 0,
    }), { status: 202, headers: { 'Content-Type': 'application/json' } })));

    await expect(requestOfficePreview('token', 'file-id')).resolves.toEqual({
      status: 'processing', retryAfterSeconds: 2,
    });
  });

  it('returns the generated private PDF bytes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-preview', {
      status: 200, headers: { 'Content-Type': 'application/pdf' },
    })));

    const result = await requestOfficePreview('token', 'file-id');
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.pdf.type).toBe('application/pdf');
      expect(await result.pdf.text()).toBe('%PDF-preview');
    }
  });

  it('rejects a non-PDF success payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not pdf', {
      status: 200, headers: { 'Content-Type': 'text/plain' },
    })));
    await expect(requestOfficePreview('token', 'file-id')).rejects.toThrow('نوع ملف غير متوقع');
  });

  it('returns a safe failed conversion state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'failed', error_code: 'conversion_failed',
    }), { status: 422, headers: { 'Content-Type': 'application/json' } })));

    await expect(requestOfficePreview('token', 'file-id')).resolves.toEqual({
      status: 'failed', errorCode: 'conversion_failed',
    });
  });

  it('surfaces a safe Worker error for unexpected responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })));
    await expect(requestOfficePreview('token', 'file-id')).rejects.toThrow('Access denied');
  });
});
