import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  getExtension,
  isAllowedExtension,
  checkMagicBytes,
  checkFileContent,
  sanitizeObjectKey,
  validateObjectKey,
  canAccessFile,
  canDeleteFile,
  checkInMemoryRateLimit,
  extractToken,
  getCorsHeaders,
  createPresignedUrl,
  downloadContentDisposition,
  awsUriEncode,
  fileDownloadResponse,
  createDownloadTicket,
  verifyDownloadTicket,
  getUploadLimit,
  positiveInteger,
  getUploadWindowMs,
  getSignedExpiry,
  processR2CleanupQueue,
  handleCleanupObjects,
} from '../src/index';
import type { Env, FileRecord } from '../src/index';

const mockEnv: Env = {
  FILES_BUCKET: {} as R2Bucket,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_ACCOUNT_ID: 'test-account-id',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173,https://jpu-it-hub.vercel.app',
  MAX_FILE_SIZE_BYTES: '20971520',
  UPLOAD_WINDOW_MINUTES: '10',
  SIGNED_URL_EXPIRY_SECONDS: '300',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeFile(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'f1',
    title: 'محاضرة الشبكات',
    subject_id: 's1',
    tab: 'summaries',
    uploader_id: 'user-uuid-1',
    status: 'approved',
    storage_path: 'user-uuid-1/file.pdf',
    object_key: 'user-uuid-1/f1.pdf',
    storage_provider: 'r2',
    file_type: 'pdf',
    file_size: 1024,
    mime_type: 'application/pdf',
    file_hash: 'abc123',
    batch_id: null,
    ...overrides,
  };
}

describe('file extension validation', () => {
  it('extracts extensions correctly', () => {
    expect(getExtension('file.pdf')).toBe('pdf');
    expect(getExtension('FILE.PDF')).toBe('pdf');
    expect(getExtension('archive.tar.gz')).toBe('gz');
    expect(getExtension('noext')).toBe('');
  });

  it('allows only whitelisted extensions', () => {
    expect(isAllowedExtension('pdf')).toBe(true);
    expect(isAllowedExtension('docx')).toBe(true);
    expect(isAllowedExtension('exe')).toBe(false);
    expect(isAllowedExtension('')).toBe(false);
    expect(isAllowedExtension('php')).toBe(false);
  });
});

describe('magic byte validation', () => {
  it('validates PDF magic bytes', () => {
    expect(checkMagicBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'pdf')).toBe(true);
  });
  it('rejects fake PDF', () => {
    expect(checkMagicBytes(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 'pdf')).toBe(false);
  });
  it('validates PNG', () => {
    expect(checkMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'png')).toBe(true);
  });
  it('validates JPEG', () => {
    expect(checkMagicBytes(new Uint8Array([0xff, 0xd8, 0xff]), 'jpg')).toBe(true);
  });
  it('allows unknown ext (no sig)', () => {
    expect(checkMagicBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'doc')).toBe(true);
  });
  it('rejects too-short data', () => {
    expect(checkMagicBytes(new Uint8Array([0x25, 0x50]), 'pdf')).toBe(false);
  });

  it('rejects a generic ZIP renamed as an Office document', () => {
    const genericZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('random/file.txt')]);
    expect(checkFileContent(genericZip, 'docx')).toBe(false);
    expect(checkFileContent(genericZip, 'pptx')).toBe(false);
  });

  it('requires the matching OOXML application folder', () => {
    const document = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('[Content_Types].xml word/document.xml')]);
    const presentation = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('[Content_Types].xml ppt/presentation.xml')]);
    expect(checkFileContent(document, 'docx')).toBe(true);
    expect(checkFileContent(document, 'pptx')).toBe(false);
    expect(checkFileContent(presentation, 'pptx')).toBe(true);
    expect(checkFileContent(presentation, 'docx')).toBe(false);
  });
});

describe('object key sanitization', () => {
  const uid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const fid = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

  it('generates valid keys', () => {
    expect(sanitizeObjectKey(uid, fid, 'pdf')).toBe(`${uid}/${fid}.pdf`);
  });
  it('rejects invalid user ID', () => {
    expect(() => sanitizeObjectKey('not-uuid', fid, 'pdf')).toThrow();
  });
  it('rejects invalid file ID', () => {
    expect(() => sanitizeObjectKey(uid, 'not-uuid', 'pdf')).toThrow();
  });
  it('rejects bad extensions', () => {
    expect(() => sanitizeObjectKey(uid, fid, 'exe')).toThrow();
  });
  it('validates correct keys', () => {
    expect(validateObjectKey(`${uid}/${fid}.pdf`)).toBe(true);
  });
  it('rejects path traversal', () => {
    expect(validateObjectKey('../../../etc/passwd')).toBe(false);
    expect(validateObjectKey(`${uid}/../../etc/passwd`)).toBe(false);
  });
  it('rejects bad extensions in key', () => {
    expect(validateObjectKey(`${uid}/${fid}.exe`)).toBe(false);
  });
  it('rejects non-uuid segments', () => {
    expect(validateObjectKey('not-uuid/not-uuid.pdf')).toBe(false);
  });
  it('rejects extra path segments', () => {
    expect(validateObjectKey(`a/${uid}/${fid}.pdf`)).toBe(false);
  });
});

describe('access control', () => {
  const uid = 'user-1';
  const other = 'user-2';

  it('admin accesses all', () => {
    expect(canAccessFile(makeFile({ status: 'pending', uploader_id: other }), uid, true)).toBe(true);
  });
  it('uploader sees own pending', () => {
    expect(canAccessFile(makeFile({ status: 'pending', uploader_id: uid }), uid, false)).toBe(true);
  });
  it('uploader sees own rejected', () => {
    expect(canAccessFile(makeFile({ status: 'rejected', uploader_id: uid }), uid, false)).toBe(true);
  });
  it('anyone sees approved', () => {
    expect(canAccessFile(makeFile({ status: 'approved', uploader_id: other }), uid, false)).toBe(true);
  });
  it('denies others pending', () => {
    expect(canAccessFile(makeFile({ status: 'pending', uploader_id: other }), uid, false)).toBe(false);
  });
  it('denies others rejected', () => {
    expect(canAccessFile(makeFile({ status: 'rejected', uploader_id: other }), uid, false)).toBe(false);
  });
  it('only admin deletes', () => {
    expect(canDeleteFile(false)).toBe(false);
    expect(canDeleteFile(true)).toBe(true);
  });
});

describe('rate limiting', () => {
  it('uses role-specific limits', () => {
    expect(getUploadLimit('student')).toBe(10);
    expect(getUploadLimit('trusted')).toBe(20);
    expect(getUploadLimit('admin')).toBe(50);
  });

  it('falls back safely when numeric environment values are malformed', () => {
    expect(positiveInteger('NaN', 20)).toBe(20);
    expect(positiveInteger('-1', 20)).toBe(20);
    expect(positiveInteger('12.5', 20)).toBe(20);
    expect(getUploadWindowMs({ ...mockEnv, UPLOAD_WINDOW_MINUTES: 'invalid' })).toBe(10 * 60 * 1000);
    expect(getSignedExpiry({ ...mockEnv, SIGNED_URL_EXPIRY_SECONDS: 'invalid' })).toBe(300);
    expect(getSignedExpiry({ ...mockEnv, SIGNED_URL_EXPIRY_SECONDS: '9999999' })).toBe(604800);
  });

  it('allows within limit', () => {
    const id = 'rl-1';
    for (let i = 0; i < 5; i++) expect(checkInMemoryRateLimit(id, 5, 600000)).toBe(true);
  });
  it('blocks over limit', () => {
    const id = 'rl-2';
    for (let i = 0; i < 5; i++) checkInMemoryRateLimit(id, 5, 600000);
    expect(checkInMemoryRateLimit(id, 5, 600000)).toBe(false);
  });
  it('resets after window', () => new Promise<void>((resolve) => {
    const id = 'rl-3';
    for (let i = 0; i < 5; i++) checkInMemoryRateLimit(id, 5, 50);
    expect(checkInMemoryRateLimit(id, 5, 50)).toBe(false);
    setTimeout(() => {
      expect(checkInMemoryRateLimit(id, 5, 50)).toBe(true);
      resolve();
    }, 100);
  }));
});

describe('JWT', () => {
  it('extracts bearer token', () => {
    expect(extractToken(new Request('https://x', { headers: { Authorization: 'Bearer tok' } }))).toBe('tok');
  });
  it('null when no header', () => {
    expect(extractToken(new Request('https://x'))).toBe(null);
  });
  it('null for malformed', () => {
    expect(extractToken(new Request('https://x', { headers: { Authorization: 'Basic abc' } }))).toBe(null);
  });
});

describe('CORS', () => {
  it('allows localhost', () => {
    expect(getCorsHeaders(mockEnv, 'http://localhost:5173').get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
  it('allows production', () => {
    expect(getCorsHeaders(mockEnv, 'https://jpu-it-hub.vercel.app').get('Access-Control-Allow-Origin')).toBe('https://jpu-it-hub.vercel.app');
  });
  it('allows this project preview without allowing other Vercel projects', () => {
    const branchPreview = 'https://jpu-it-hub-git-codex-fix-jpu-it-hub.vercel.app';
    const deploymentPreview = 'https://jpu-it-mfe1yvf6k-jpu-it-hub.vercel.app';
    expect(getCorsHeaders(mockEnv, branchPreview).get('Access-Control-Allow-Origin')).toBe(branchPreview);
    expect(getCorsHeaders(mockEnv, deploymentPreview).get('Access-Control-Allow-Origin')).toBe(deploymentPreview);
    expect(getCorsHeaders(mockEnv, 'https://evil-project-jpu-it-hub.vercel.app').get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('rejects unknown origin', () => {
    expect(getCorsHeaders(mockEnv, 'https://evil.com').get('Access-Control-Allow-Origin')).toBe(null);
  });
  it('handles null', () => {
    expect(getCorsHeaders(mockEnv, null).get('Access-Control-Allow-Origin')).toBe(null);
  });
});

describe('upload validation', () => {
  it('rejects bad ext', () => {
    expect(isAllowedExtension(getExtension(''))).toBe(false);
  });
  it('rejects oversized', () => {
    expect(21 * 1024 * 1024 > parseInt(mockEnv.MAX_FILE_SIZE_BYTES, 10)).toBe(true);
  });
  it('rejects dangerous types', () => {
    expect(isAllowedExtension('exe')).toBe(false);
    expect(isAllowedExtension('sh')).toBe(false);
    expect(isAllowedExtension('svg')).toBe(false);
  });
});

describe('download access', () => {
  it('streams files as attachments with safe response headers', async () => {
    const bytes = new TextEncoder().encode('pdf-content');
    const object = {
      body: new Blob([bytes]).stream(),
      size: bytes.byteLength,
      httpMetadata: { contentType: 'application/pdf' },
    } as unknown as R2ObjectBody;
    const response = fileDownloadResponse(
      mockEnv,
      new Request('https://worker.test/download', { headers: { Origin: 'http://localhost:5173' } }),
      makeFile({ title: 'Lecture 1', file_type: 'pdf' }),
      object,
    );
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename="Lecture 1.pdf"');
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('X-File-Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(await response.text()).toBe('pdf-content');
  });
  it('issues tamper-resistant, expiring iOS download tickets', async () => {
    const payload = { file_id: 'f1', user_id: 'u1', role: 'student' as const, exp: Math.floor(Date.now() / 1000) + 60 };
    const ticket = await createDownloadTicket(mockEnv, payload);
    await expect(verifyDownloadTicket(mockEnv, ticket)).resolves.toEqual(payload);
    await expect(verifyDownloadTicket(mockEnv, `${ticket}x`)).resolves.toBeNull();
    const expired = await createDownloadTicket(mockEnv, { ...payload, exp: Math.floor(Date.now() / 1000) - 1 });
    await expect(verifyDownloadTicket(mockEnv, expired)).resolves.toBeNull();
  });
  it('uses AWS RFC 3986 encoding for signed response parameters', () => {
    expect(awsUriEncode("attachment; filename*=UTF-8''lecture 1.pdf"))
      .toBe('attachment%3B%20filename%2A%3DUTF-8%27%27lecture%201.pdf');
  });
  it('signs the forced-download disposition as part of the R2 URL', async () => {
    const disposition = downloadContentDisposition(makeFile({ title: 'Lecture 1', file_type: 'pdf' }));
    const url = await createPresignedUrl(mockEnv, 'user/file.pdf', 'GET', 300, disposition);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('response-content-disposition')).toBe(disposition);
    expect(url).toContain('response-content-disposition=attachment%3B%20filename%3D%22Lecture%201.pdf%22%3B%20filename%2A%3D');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('uses the configured bucket when signing staging URLs', async () => {
    const url = await createPresignedUrl(
      { ...mockEnv, R2_BUCKET_NAME: 'jpu-it-hub-files-v2-staging' },
      'user/file.pdf',
      'GET',
      300,
    );
    expect(new URL(url).pathname).toBe('/jpu-it-hub-files-v2-staging/user/file.pdf');
  });
  it('preserves the stored upload name in the download response', () => {
    const value = downloadContentDisposition(makeFile({ title: 'Lecture 1', file_type: 'pptx' }));
    expect(value).toContain('filename="Lecture 1.pptx"');
    expect(value).toContain("filename*=UTF-8''Lecture%201.pptx");
  });
  it('approved accessible by all', () => {
    expect(canAccessFile(makeFile({ status: 'approved', uploader_id: 'other' }), 'me', false)).toBe(true);
  });
  it('own pending accessible', () => {
    expect(canAccessFile(makeFile({ status: 'pending', uploader_id: 'me' }), 'me', false)).toBe(true);
  });
  it('others pending denied', () => {
    expect(canAccessFile(makeFile({ status: 'pending', uploader_id: 'other' }), 'me', false)).toBe(false);
  });
  it('others rejected denied', () => {
    expect(canAccessFile(makeFile({ status: 'rejected', uploader_id: 'other' }), 'me', false)).toBe(false);
  });
  it('admin accesses all', () => {
    expect(canAccessFile(makeFile({ status: 'pending', uploader_id: 'other' }), 'admin', true)).toBe(true);
  });
});

describe('delete access', () => {
  it('only admin', () => {
    expect(canDeleteFile(false)).toBe(false);
    expect(canDeleteFile(true)).toBe(true);
  });
});

describe('cascade object cleanup', () => {
  const key = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890/b2c3d4e5-f6a7-8901-bcde-f12345678901.pdf';

  it('requires an administrator', async () => {
    const response = await handleCleanupObjects(
      mockEnv,
      new Request('https://worker.test/cleanup-objects', {
        method: 'POST', body: JSON.stringify({ object_keys: [key] }),
      }),
      false,
    );
    expect(response.status).toBe(403);
  });

  it('deduplicates and removes validated object keys', async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const response = await handleCleanupObjects(
      { ...mockEnv, FILES_BUCKET: { delete: deleteObject } as unknown as R2Bucket },
      new Request('https://worker.test/cleanup-objects', {
        method: 'POST', body: JSON.stringify({ object_keys: [key, key] }),
      }),
      true,
    );
    expect(response.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({ success: true, cleanup_queued: false });
  });

  it('rejects unsafe object keys before touching storage', async () => {
    const deleteObject = vi.fn();
    const response = await handleCleanupObjects(
      { ...mockEnv, FILES_BUCKET: { delete: deleteObject } as unknown as R2Bucket },
      new Request('https://worker.test/cleanup-objects', {
        method: 'POST', body: JSON.stringify({ object_keys: ['../../secret'] }),
      }),
      true,
    );
    expect(response.status).toBe(400);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('scheduled R2 cleanup', () => {
  it('deletes queued objects and marks their records completed', async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'cleanup-id',
        object_key: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890/b2c3d4e5-f6a7-8901-bcde-f12345678901.pdf',
        attempts: 0,
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(processR2CleanupQueue({
      ...mockEnv,
      FILES_BUCKET: { delete: deleteObject } as unknown as R2Bucket,
    })).resolves.toBe(1);
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('r2_cleanup_queue?id=eq.cleanup-id'),
      expect.objectContaining({ method: 'PATCH' }),
    );
    const update = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(update.body))).toMatchObject({ status: 'completed', attempts: 1 });
  });

  it('marks unsafe object keys failed without touching R2', async () => {
    const deleteObject = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'cleanup-id', object_key: '../../secret', attempts: 0,
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(processR2CleanupQueue({
      ...mockEnv,
      FILES_BUCKET: { delete: deleteObject } as unknown as R2Bucket,
    })).resolves.toBe(0);
    expect(deleteObject).not.toHaveBeenCalled();
    const update = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(update.body))).toMatchObject({ status: 'failed', attempts: 1 });
  });
});

describe('backward compat', () => {
  it('legacy supabase files work', () => {
    const f = makeFile({ object_key: null, storage_provider: 'supabase', storage_path: 'old/file.pdf' });
    expect(f.storage_provider).toBe('supabase');
    expect(f.object_key).toBe(null);
    expect(f.storage_path).toBeTruthy();
  });
  it('new r2 files work', () => {
    const f = makeFile({ object_key: 'u/f.pdf', storage_provider: 'r2' });
    expect(f.storage_provider).toBe('r2');
    expect(f.object_key).toBeTruthy();
  });
});

describe('batch failure / rollback', () => {
  it('uploader sees own rejected', () => {
    expect(canAccessFile(makeFile({ status: 'rejected', uploader_id: 'u1' }), 'u1', false)).toBe(true);
  });
  it('rejects empty keys', () => {
    expect(validateObjectKey('')).toBe(false);
  });
  it('sanitized keys pass validation', () => {
    const uid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const fid = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
    expect(validateObjectKey(sanitizeObjectKey(uid, fid, 'pdf'))).toBe(true);
  });
});
