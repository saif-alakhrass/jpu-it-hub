import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkerRequestError,
  checkHashDuplicate,
  computeFileHash,
  confirmUpload,
  deleteFileViaWorker,
  getWorkerUrl,
  isR2Configured,
  requestDownloadPresign,
  requestUploadPresign,
  uploadToR2,
} from './r2Client';

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  };
}

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.lastCall as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker configuration', () => {
  it('reports whether a worker URL is configured', () => {
    expect(isR2Configured()).toBe(Boolean(getWorkerUrl()));
  });
});

describe('requestUploadPresign', () => {
  const params = { file_name: 'notes.pdf', file_size: 10, file_type: 'pdf', subject_id: 'sub-1', tab: 'summaries' };

  it('posts the upload metadata and returns the presign payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ upload_url: 'https://r2/put', object_key: 'k', file_id: 'f', mime_type: 'application/pdf', expires_in: 600 }));

    const result = await requestUploadPresign('token-123', params);

    expect(result?.object_key).toBe('k');
    const { url, init } = lastRequest();
    expect(url).toMatch(/\/upload-presign$/);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-123');
    expect(JSON.parse(init.body as string)).toEqual(params);
  });

  it('surfaces the worker error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'حجم الملف كبير' }, { ok: false, status: 413 }));

    await expect(requestUploadPresign('token-123', params)).rejects.toThrow(WorkerRequestError);
    await expect(requestUploadPresign('token-123', params)).rejects.toThrow('حجم الملف كبير');
  });

  it('falls back to a status-based message for non-JSON errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new Error('not json')) });

    await expect(requestUploadPresign('token-123', params)).rejects.toThrow('(502)');
  });
});

describe('uploadToR2', () => {
  it('uploads through the authenticated worker proxy', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const file = new File(['data'], 'notes.pdf', { type: 'application/pdf' });

    await expect(uploadToR2('https://r2/put', file, 'application/pdf', 'token-123', 'subject/notes.pdf')).resolves.toBe(true);

    const { url, init } = lastRequest();
    expect(url).toMatch(/\/upload-proxy$/);
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['X-Object-Key']).toBe('subject/notes.pdf');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/pdf');
  });

  it('reports a failed upload', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const file = new File(['data'], 'notes.pdf', { type: 'application/pdf' });

    await expect(uploadToR2('https://r2/put', file, 'application/pdf', 'token', 'key')).resolves.toBe(false);
  });
});

describe('computeFileHash', () => {
  it('hashes file contents as lowercase hex sha-256', async () => {
    const digest = vi.fn().mockResolvedValue(new Uint8Array([0, 15, 255]).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });
    const file = { arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) } as unknown as File;

    await expect(computeFileHash(file)).resolves.toBe('000fff');
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.anything());
  });
});

describe('checkHashDuplicate', () => {
  it('returns the worker verdict', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ is_duplicate: true }));

    await expect(checkHashDuplicate('token', 'hash', 'sub-1')).resolves.toBe(true);
    expect(JSON.parse(lastRequest().init.body as string)).toEqual({ file_hash: 'hash', subject_id: 'sub-1' });
  });

  it('treats a failed check as not duplicated so the upload can proceed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

    await expect(checkHashDuplicate('token', 'hash', 'sub-1')).resolves.toBe(false);
  });
});

describe('confirmUpload', () => {
  const params = {
    object_key: 'k', file_id: 'f', file_name: 'notes.pdf', file_type: 'pdf',
    file_size: 10, file_hash: 'hash', mime_type: 'application/pdf', subject_id: 'sub-1', tab: 'summaries',
  };

  it('returns the worker payload on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, file: { id: 'f' } }));

    await expect(confirmUpload('token', params)).resolves.toEqual({ success: true, file: { id: 'f' } });
    expect(lastRequest().url).toMatch(/\/confirm-upload$/);
  });

  it('returns null when the worker rejects the confirmation', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'db failed' }, { ok: false, status: 500 }));

    await expect(confirmUpload('token', params)).resolves.toBeNull();
  });
});

describe('requestDownloadPresign', () => {
  it('defaults to preview mode and returns the presigned download', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ download_url: 'https://r2/get', provider: 'r2', expires_in: 300 }));

    await expect(requestDownloadPresign('token', 'file-1')).resolves.toEqual({ download_url: 'https://r2/get', provider: 'r2', expires_in: 300 });
    expect(JSON.parse(lastRequest().init.body as string)).toEqual({ file_id: 'file-1', mode: 'preview' });
  });

  it('passes the requested mode through and reports legacy Supabase files', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ provider: 'supabase', storage_path: 'legacy/notes.pdf' }));

    const result = await requestDownloadPresign('token', 'file-1', 'download');

    expect(result?.provider).toBe('supabase');
    expect(JSON.parse(lastRequest().init.body as string)).toEqual({ file_id: 'file-1', mode: 'download' });
  });

  it('returns null when the worker refuses the request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, { ok: false, status: 401 }));

    await expect(requestDownloadPresign('token', 'file-1')).resolves.toBeNull();
  });
});

describe('deleteFileViaWorker', () => {
  it('returns the delete result, including a queued cleanup', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, cleanup_queued: true }));

    await expect(deleteFileViaWorker('token', 'file-1')).resolves.toEqual({ success: true, cleanup_queued: true });
    expect(lastRequest().url).toMatch(/\/delete$/);
  });

  it('returns null when the worker request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 403 }));

    await expect(deleteFileViaWorker('token', 'file-1')).resolves.toBeNull();
  });
});
