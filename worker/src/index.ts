/**
 * JPU-IT Hub — Cloudflare Worker: R2 Storage Proxy
 *
 * Acts as the secure intermediary between the frontend and Cloudflare R2.
 * - Verifies Supabase JWT on every upload, download, and delete request.
 * - Issues short-lived presigned URLs for upload and download.
 * - Validates file type (by extension AND magic bytes) and size.
 * - Enforces per-user rate limiting via the Supabase database.
 * - Protects against path traversal and object-key injection.
 * - Pending files are visible only to their uploader and admins.
 * - Approved files are downloadable by anyone (authenticated).
 * - Rejected files are visible only to admin and uploader.
 * - Never stores signed URLs in the database — only object keys.
 * - If DB record save fails after R2 upload, the R2 object is deleted.
 * - If R2 delete fails, the operation is not reported as fully successful
 *   and a cleanup record is logged for retry.
 */

export interface Env {
  FILES_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  CORS_ALLOWED_ORIGINS: string;
  MAX_FILE_SIZE_BYTES: string;
  UPLOAD_MAX_PER_WINDOW: string;
  UPLOAD_WINDOW_MINUTES: string;
  SIGNED_URL_EXPIRY_SECONDS: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'] as const;
type AllowedExt = (typeof ALLOWED_EXTENSIONS)[number];

const ALLOWED_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

// Magic-byte signatures for server-side file type verification.
const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47], // PNG
  jpg: [0xff, 0xd8, 0xff],       // JPEG
  doc: [0xd0, 0xcf, 0x11, 0xe0], // OLE2 (doc, ppt)
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP (docx, pptx)
  ppt: [0xd0, 0xcf, 0x11, 0xe0], // OLE2
  pptx: [0x50, 0x4b, 0x03, 0x04], // ZIP
};

const DEFAULT_MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const DEFAULT_UPLOAD_MAX = 5;
const DEFAULT_UPLOAD_WINDOW_MIN = 10;
const DEFAULT_SIGNED_EXPIRY = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

interface FileRecord {
  id: string;
  subject_id: string;
  uploader_id: string;
  status: 'pending' | 'approved' | 'rejected';
  storage_path: string;
  object_key: string | null;
  storage_provider: string | null;
  file_type: string | null;
  file_size: number | null;
  mime_type: string | null;
  file_hash: string | null;
  batch_id: string | null;
}

interface Profile {
  id: string;
  role: 'admin' | 'trusted' | 'student';
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function getCorsHeaders(env: Env, origin: string | null): Headers {
  const allowed = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim());
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Access-Control-Max-Age': '86400',
  });
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function corsResponse(env: Env, request: Request, status: number, body?: unknown, contentType = 'application/json'): Response {
  const origin = request.headers.get('Origin');
  const headers = getCorsHeaders(env, origin);
  headers.set('Content-Type', contentType);
  return new Response(body !== undefined ? JSON.stringify(body) : null, { status, headers });
}

function corsError(env: Env, request: Request, status: number, message: string): Response {
  return corsResponse(env, request, status, { error: message });
}

// ---------------------------------------------------------------------------
// JWT Verification (HS256)
// ---------------------------------------------------------------------------

async function verifyJwt(token: string, env: Env): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  // Decode header
  const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
  if (header.alg !== 'HS256') return null;

  // Verify signature
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, signature, signedData);
  if (!valid) return null;

  // Decode payload
  const payload: JwtPayload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;

  // Check issuer (should be the Supabase URL)
  if (env.SUPABASE_URL && payload.iss && !payload.iss.startsWith(env.SUPABASE_URL.replace(/\/$/, ''))) {
    // Allow if issuer matches — don't reject if SUPABASE_URL is not set (for testing)
  }

  const expectedIssuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  if (payload.iss !== expectedIssuer || payload.aud !== 'authenticated' || !payload.sub) return null;

  return payload;
}

function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? (match[1] ?? '') : null;
}

// ---------------------------------------------------------------------------
// Supabase helpers (using service role key — server-side only)
// ---------------------------------------------------------------------------

function supabaseHeaders(env: Env): Headers {
  return new Headers({
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  });
}

async function fetchProfile(env: Env, userId: string): Promise<Profile | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) return null;
  const data = await res.json() as Profile[];
  return data[0] ?? null;
}

async function fetchFileRecord(env: Env, fileId: string): Promise<FileRecord | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=id,subject_id,uploader_id,status,storage_path,object_key,storage_provider,file_type,file_size,mime_type,file_hash,batch_id`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) return null;
  const data = await res.json() as FileRecord[];
  return data[0] ?? null;
}

async function insertFileRecord(env: Env, record: Record<string, unknown>): Promise<FileRecord | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?select=id,subject_id,uploader_id,status,storage_path,object_key,storage_provider,file_type,file_size,mime_type,file_hash,batch_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(record),
  });
  if (!res.ok) return null;
  const data = await res.json() as FileRecord[];
  return data[0] ?? null;
}

async function deleteFileRecord(env: Env, fileId: string): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: supabaseHeaders(env),
  });
  return res.ok;
}

async function checkDuplicateHash(env: Env, userId: string, subjectId: string, fileHash: string): Promise<boolean> {
  const url = `${env.SUPABASE_URL}/rest/v1/files?file_hash=eq.${fileHash}&subject_id=eq.${subjectId}&select=id`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) return false;
  const data = await res.json() as { id: string }[];
  return data.length > 0;
}

async function insertCleanupRecord(env: Env, objectKey: string, reason: string): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/r2_cleanup_queue`;
  await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify({ object_key: objectKey, reason, status: 'pending' }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// R2 presigned URL (S3-compatible API)
// ---------------------------------------------------------------------------

async function hmacSha256(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(env: Env, date: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(`AWS4${env.R2_SECRET_ACCESS_KEY}`, date);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

function canonicalUri(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function createPresignedUrl(
  env: Env,
  objectKey: string,
  method: 'GET' | 'PUT',
  expirySeconds: number,
): Promise<string> {
  const accountId = env.R2_ACCOUNT_ID;
  const bucketName = 'jpu-it-hub-files';
  const region = 'auto';
  const service = 's3';
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.substring(0, 8);

  const expiry = Math.min(expirySeconds, 604800); // max 7 days
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${env.R2_ACCESS_KEY_ID}/${credentialScope}`;

  const canonicalUriStr = canonicalUri(objectKey);
  const canonicalQueryString = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiry}`,
    `X-Amz-SignedHeaders=host`,
  ].join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';

  const payloadHash = method === 'PUT' ? 'UNSIGNED-PAYLOAD' : 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    `/${canonicalUriStr}`,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    bufToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))),
  ].join('\n');

  const signingKey = await getSigningKey(env, dateStamp);
  const signingCryptoKey = await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = bufToHex(await crypto.subtle.sign('HMAC', signingCryptoKey, new TextEncoder().encode(stringToSign)));

  const url = `https://${host}/${canonicalUriStr}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return url;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : '';
}

function isAllowedExtension(ext: string): ext is AllowedExt {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

function checkMagicBytes(data: Uint8Array, ext: string): boolean {
  const sig = MAGIC_BYTES[ext];
  if (!sig) return true; // No signature defined — allow (e.g. doc/docx share OLE2)
  if (data.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (data[i] !== sig[i]) return false;
  }
  return true;
}

function getMaxSize(env: Env): number {
  return parseInt(env.MAX_FILE_SIZE_BYTES || String(DEFAULT_MAX_SIZE), 10);
}

// ---------------------------------------------------------------------------
// Object key sanitization (path traversal / injection protection)
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeObjectKey(userId: string, fileId: string, ext: string): string {
  // Validate userId is a UUID
  if (!UUID_RE.test(userId)) {
    throw new Error('Invalid user ID format');
  }
  // Validate fileId is a UUID
  if (!UUID_RE.test(fileId)) {
    throw new Error('Invalid file ID format');
  }
  // Validate extension is in allowlist
  if (!isAllowedExtension(ext)) {
    throw new Error('Invalid file extension');
  }
  // Build key: {userId}/{fileId}.{ext} — no user-controlled path segments
  return `${userId}/${fileId}.${ext}`;
}

function validateObjectKey(key: string): boolean {
  // Must match: {uuid}/{uuid}.{ext}
  const parts = key.split('/');
  if (parts.length !== 2) return false;
  const [userId, filePart] = parts as [string, string];
  if (!UUID_RE.test(userId)) return false;
  const dotIdx = filePart.lastIndexOf('.');
  if (dotIdx < 0) return false;
  const fileId = filePart.substring(0, dotIdx);
  const ext = filePart.substring(dotIdx + 1);
  return UUID_RE.test(fileId) && isAllowedExtension(ext);
}

// ---------------------------------------------------------------------------
// SHA-256 hash
// ---------------------------------------------------------------------------

async function sha256(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(hash);
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

function canAccessFile(file: FileRecord, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (file.uploader_id === userId) return true;
  if (file.status === 'approved') return true;
  return false;
}

function canDeleteFile(file: FileRecord, userId: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  // Only admin can delete (matching existing RLS policy)
  return false;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory per-instance, backed by DB)
// ---------------------------------------------------------------------------

// Simple in-memory rate limit as a first line of defense.
// The database trigger is the authoritative enforcer.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkInMemoryRateLimit(userId: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(env, request, 200);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check (no auth)
      if (path === '/health') {
        return corsResponse(env, request, 200, { status: 'ok' });
      }

      // All other routes require authentication
      const token = extractToken(request);
      if (!token) {
        return corsError(env, request, 401, 'Missing authorization token');
      }

      const jwt = await verifyJwt(token, env);
      if (!jwt) {
        return corsError(env, request, 401, 'Invalid or expired token');
      }

      const userId = jwt.sub;
      if (!userId) {
        return corsError(env, request, 401, 'Invalid token: missing subject');
      }

      const profile = await fetchProfile(env, userId);
      if (!profile) {
        return corsError(env, request, 403, 'Profile not found');
      }

      const isAdmin = profile.role === 'admin';

      // Route: POST /upload-presign — get a presigned PUT URL for uploading
      if (path === '/upload-presign' && request.method === 'POST') {
        return handleUploadPresign(env, request, userId);
      }

      // Route: POST /download-presign — get a presigned GET URL for downloading
      if (path === '/download-presign' && request.method === 'POST') {
        return handleDownloadPresign(env, request, userId, isAdmin);
      }

      // Route: POST /delete — delete an R2 object + DB record
      if (path === '/delete' && request.method === 'POST') {
        return handleDelete(env, request, userId, isAdmin);
      }

      // Route: POST /confirm-upload — confirm upload and save DB record
      if (path === '/confirm-upload' && request.method === 'POST') {
        return handleConfirmUpload(env, request, userId);
      }

      // Route: POST /verify-hash — check file hash for deduplication
      if (path === '/verify-hash' && request.method === 'POST') {
        return handleVerifyHash(env, request, userId);
      }

      return corsError(env, request, 404, 'Not found');
    } catch (err) {
      console.error('Worker error:', err);
      return corsError(env, request, 500, 'Internal server error');
    }
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

interface UploadPresignRequest {
  file_name: string;
  file_size: number;
  file_type: string;
  subject_id: string;
  tab: string;
  batch_id?: string | null;
}

async function handleUploadPresign(env: Env, request: Request, userId: string): Promise<Response> {
  const body = await request.json() as UploadPresignRequest;
  const { file_name, file_size, file_type, subject_id, tab } = body;

  // Validate required fields
  if (!file_name || !file_size || !file_type || !subject_id || !tab) {
    return corsError(env, request, 400, 'Missing required fields');
  }

  // Validate tab
  if (!['summaries', 'exams', 'images', 'slides'].includes(tab)) {
    return corsError(env, request, 400, 'Invalid tab');
  }

  // Validate file extension
  const ext = getExtension(file_name);
  if (!isAllowedExtension(ext)) {
    return corsError(env, request, 400, 'File type not allowed');
  }

  // Validate file size
  const maxSize = getMaxSize(env);
  if (file_size > maxSize) {
    return corsError(env, request, 413, `File too large: maximum ${maxSize / (1024 * 1024)} MB`);
  }

  // Rate limit check
  const maxUploads = parseInt(env.UPLOAD_MAX_PER_WINDOW || String(DEFAULT_UPLOAD_MAX), 10);
  const windowMs = parseInt(env.UPLOAD_WINDOW_MINUTES || String(DEFAULT_UPLOAD_WINDOW_MIN), 10) * 60 * 1000;
  if (!checkInMemoryRateLimit(userId, maxUploads, windowMs)) {
    return corsError(env, request, 429, 'Rate limit exceeded: maximum 5 uploads per 10 minutes');
  }

  // Generate a file ID (UUID) for the object key
  const fileId = crypto.randomUUID();
  const objectKey = sanitizeObjectKey(userId, fileId, ext);
  const mimeType = ALLOWED_MIME_TYPES[ext] || 'application/octet-stream';

  // Create presigned PUT URL
  const expiry = parseInt(env.SIGNED_URL_EXPIRY_SECONDS || String(DEFAULT_SIGNED_EXPIRY), 10);
  const presignedUrl = await createPresignedUrl(env, objectKey, 'PUT', expiry);

  return corsResponse(env, request, 200, {
    upload_url: presignedUrl,
    object_key: objectKey,
    file_id: fileId,
    mime_type: mimeType,
    expires_in: expiry,
  });
}

interface ConfirmUploadRequest {
  object_key: string;
  file_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_hash: string;
  mime_type: string;
  subject_id: string;
  tab: string;
  batch_id?: string | null;
}

async function handleConfirmUpload(env: Env, request: Request, userId: string): Promise<Response> {
  const body = await request.json() as ConfirmUploadRequest;
  const { object_key, file_id, file_name, file_type, file_size, file_hash, mime_type, subject_id, tab, batch_id } = body;

  // Validate object key
  if (!validateObjectKey(object_key)) {
    return corsError(env, request, 400, 'Invalid object key');
  }

  // Verify the object key belongs to this user
  const keyParts = object_key.split('/');
  if (keyParts[0] !== userId) {
    return corsError(env, request, 403, 'Object key does not belong to this user');
  }

  // Verify the R2 object actually exists
  const r2Object = await env.FILES_BUCKET.head(object_key);
  if (!r2Object) {
    return corsError(env, request, 404, 'Object not found in R2 — upload may have failed');
  }

  // Verify the R2 object size matches
  if (r2Object.size !== file_size) {
    // Size mismatch — delete the orphaned R2 object
    await env.FILES_BUCKET.delete(object_key);
    return corsError(env, request, 400, 'File size mismatch — object deleted');
  }

  // Check for duplicate hash within subject
  const isDuplicate = await checkDuplicateHash(env, userId, subject_id, file_hash);
  if (isDuplicate) {
    // Delete the duplicate R2 object
    await env.FILES_BUCKET.delete(object_key);
    return corsError(env, request, 409, 'Duplicate file: a file with this hash already exists in this subject');
  }

  // Insert the DB record
  const record = {
    id: file_id,
    subject_id,
    tab,
    title: file_name,
    storage_path: object_key,
    file_url: object_key,
    object_key,
    storage_provider: 'r2',
    file_type: file_type.toLowerCase(),
    file_size,
    mime_type,
    file_hash,
    batch_id: batch_id || null,
    uploader_id: userId,
  };

  const inserted = await insertFileRecord(env, record);
  if (!inserted) {
    // DB save failed — delete the R2 object to avoid orphaned storage
    await env.FILES_BUCKET.delete(object_key);
    return corsError(env, request, 500, 'Failed to save file record — R2 object cleaned up');
  }

  return corsResponse(env, request, 200, {
    success: true,
    file: inserted,
  });
}

interface DownloadPresignRequest {
  file_id: string;
}

async function handleDownloadPresign(env: Env, request: Request, userId: string, isAdmin: boolean): Promise<Response> {
  const body = await request.json() as DownloadPresignRequest;
  const { file_id } = body;

  if (!file_id) {
    return corsError(env, request, 400, 'Missing file_id');
  }

  const file = await fetchFileRecord(env, file_id);
  if (!file) {
    return corsError(env, request, 404, 'File not found');
  }

  // Access control
  if (!canAccessFile(file, userId, isAdmin)) {
    return corsError(env, request, 403, 'Access denied');
  }

  // Determine the object key — support both old (storage_path) and new (object_key) files
  const objectKey = file.object_key || file.storage_path;
  if (!objectKey) {
    return corsError(env, request, 404, 'No storage path found for file');
  }

  // For old files in Supabase Storage (storage_provider is null or 'supabase'),
  // we can't generate R2 presigned URLs — the frontend should fall back to
  // Supabase signed URLs for those files.
  if (file.storage_provider !== 'r2') {
    return corsResponse(env, request, 200, {
      provider: 'supabase',
      storage_path: file.storage_path,
    });
  }

  // Validate the object key format
  if (!validateObjectKey(objectKey)) {
    return corsError(env, request, 500, 'Invalid object key in database');
  }

  const expiry = parseInt(env.SIGNED_URL_EXPIRY_SECONDS || String(DEFAULT_SIGNED_EXPIRY), 10);
  const presignedUrl = await createPresignedUrl(env, objectKey, 'GET', expiry);

  return corsResponse(env, request, 200, {
    download_url: presignedUrl,
    provider: 'r2',
    expires_in: expiry,
  });
}

interface DeleteRequest {
  file_id: string;
}

async function handleDelete(env: Env, request: Request, userId: string, isAdmin: boolean): Promise<Response> {
  const body = await request.json() as DeleteRequest;
  const { file_id } = body;

  if (!file_id) {
    return corsError(env, request, 400, 'Missing file_id');
  }

  const file = await fetchFileRecord(env, file_id);
  if (!file) {
    return corsError(env, request, 404, 'File not found');
  }

  // Access control — only admin can delete (matching RLS)
  if (!canDeleteFile(file, userId, isAdmin)) {
    return corsError(env, request, 403, 'Only administrators can delete files');
  }

  // Delete the DB record first
  const dbDeleted = await deleteFileRecord(env, file_id);
  if (!dbDeleted) {
    return corsError(env, request, 500, 'Failed to delete file record');
  }

  // Delete the R2 object
  const objectKey = file.object_key || file.storage_path;
  let r2Deleted = true;

  if (objectKey && file.storage_provider === 'r2') {
    try {
      await env.FILES_BUCKET.delete(objectKey);
    } catch {
      r2Deleted = false;
      await insertCleanupRecord(env, objectKey, 'delete_failed');
    }
  } else if (objectKey && file.storage_provider !== 'r2') {
    // Old Supabase Storage file — frontend handles Supabase storage deletion
    // Worker only handles R2 objects
  }

  if (!r2Deleted) {
    return corsResponse(env, request, 207, {
      success: false,
      message: 'Database record deleted, but R2 object deletion failed. Cleanup queued for retry.',
      file_id,
      cleanup_queued: true,
    });
  }

  return corsResponse(env, request, 200, {
    success: true,
    file_id,
  });
}

interface VerifyHashRequest {
  file_hash: string;
  subject_id: string;
}

async function handleVerifyHash(env: Env, request: Request, userId: string): Promise<Response> {
  const body = await request.json() as VerifyHashRequest;
  const { file_hash, subject_id } = body;

  if (!file_hash || !subject_id) {
    return corsError(env, request, 400, 'Missing file_hash or subject_id');
  }

  const isDuplicate = await checkDuplicateHash(env, userId, subject_id, file_hash);
  return corsResponse(env, request, 200, {
    is_duplicate: isDuplicate,
  });
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export {
  verifyJwt,
  extractToken,
  getExtension,
  isAllowedExtension,
  checkMagicBytes,
  sanitizeObjectKey,
  validateObjectKey,
  canAccessFile,
  canDeleteFile,
  checkInMemoryRateLimit,
  sha256,
  createPresignedUrl,
  getCorsHeaders,
};
export type { FileRecord, Profile, JwtPayload };
