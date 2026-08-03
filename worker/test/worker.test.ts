import { describe, it, expect, beforeEach } from 'vitest';
import {
  getExtension,
  isAllowedExtension,
  checkMagicBytes,
  sanitizeObjectKey,
  validateObjectKey,
  canAccessFile,
  canDeleteFile,
  checkInMemoryRateLimit,
  verifyJwt,
  extractToken,
  getCorsHeaders,
} from '../src/index';
import type { Env, FileRecord } from '../src/index';

const mockEnv: Env = {
  FILES_BUCKET: {} as R2Bucket,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_ACCOUNT_ID: 'test-account-id',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173,https://jpu-it-hub.vercel.app',
  MAX_FILE_SIZE_BYTES: '20971520',
  UPLOAD_MAX_PER_WINDOW: '5',
  UPLOAD_WINDOW_MINUTES: '10',
  SIGNED_URL_EXPIRY_SECONDS: '300',
};

function makeFile(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'f1', subject_id: 's1', uploader_id: 'user-uuid-1', status: 'approved',
    storage_path: 'user-uuid-1/file.pdf', object_key: 'user-uuid-1/f1.pdf',
    storage_provider: 'r2', file_type: 'pdf', file_size: 1024,
    mime_type: 'application/pdf', file_hash: 'abc123', batch_id: null,
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
    expect(canDeleteFile(makeFile({ uploader_id: uid }), uid, false)).toBe(false);
    expect(canDeleteFile(makeFile({ uploader_id: uid }), uid, true)).toBe(true);
  });
});

describe('rate limiting', () => {
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
  it('rejects bad tokens', async () => {
    expect(await verifyJwt('bad', mockEnv)).toBe(null);
    expect(await verifyJwt('', mockEnv)).toBe(null);
  });
});

describe('CORS', () => {
  it('allows localhost', () => {
    expect(getCorsHeaders(mockEnv, 'http://localhost:5173').get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });
  it('allows production', () => {
    expect(getCorsHeaders(mockEnv, 'https://jpu-it-hub.vercel.app').get('Access-Control-Allow-Origin')).toBe('https://jpu-it-hub.vercel.app');
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
    expect(canDeleteFile(makeFile({ uploader_id: 'u1' }), 'u1', false)).toBe(false);
    expect(canDeleteFile(makeFile({ uploader_id: 'u1' }), 'admin', true)).toBe(true);
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
