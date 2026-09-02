export interface OfficePreviewJob {
  file_id: string;
  source_hash: string;
  converter_version: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^v[0-9]+$/;

export function isValidPreviewJob(value: unknown): value is OfficePreviewJob {
  if (!value || typeof value !== 'object') return false;
  const job = value as Partial<OfficePreviewJob>;
  return UUID_RE.test(job.file_id ?? '')
    && HASH_RE.test(job.source_hash ?? '')
    && VERSION_RE.test(job.converter_version ?? '');
}

export function buildPreviewKey(job: OfficePreviewJob): string {
  if (!isValidPreviewJob(job)) throw new Error('Invalid preview job');
  return `previews/${job.file_id}/${job.source_hash}-${job.converter_version}.pdf`;
}

export function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

const PERMANENT_CODES = new Set([
  'invalid_request', 'input_too_large', 'empty_input', 'output_too_large',
  'invalid_pdf_output', 'source_object_missing', 'source_mismatch',
  'source_signature_mismatch',
]);

export function isPermanentConversionError(code: string): boolean {
  return PERMANENT_CODES.has(code);
}

export function safeErrorCode(value: unknown): string {
  if (typeof value !== 'string') return 'conversion_failed';
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 80);
  return normalized || 'conversion_failed';
}
