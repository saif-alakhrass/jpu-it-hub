import { Container, getRandom } from '@cloudflare/containers';
import { buildPreviewKey, hasPdfSignature, isPermanentConversionError, isValidPreviewJob, safeErrorCode, type OfficePreviewJob } from './core';

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;
const CONVERTER_INSTANCES = 2;

interface Env {
  FILES_BUCKET: R2Bucket;
  OFFICE_CONVERTER: DurableObjectNamespace<OfficeConverter>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ConverterFile {
  id: string;
  object_key: string | null;
  storage_provider: string | null;
  file_type: string | null;
  file_size: number | null;
  file_hash: string | null;
  preview_status: string;
  preview_source_hash: string | null;
  preview_converter_version: string | null;
}

export class OfficeConverter extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

function supabaseHeaders(env: Env): Headers {
  return new Headers({
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  });
}

async function rpc<T>(env: Env, name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: supabaseHeaders(env), body: JSON.stringify(body),
  });
  if (!response.ok) throw Object.assign(new Error(`rpc_${name}_failed`), { code: 'database_unavailable' });
  const payload = await response.text();
  return (payload ? JSON.parse(payload) : undefined) as T;
}

async function fetchFile(env: Env, fileId: string): Promise<ConverterFile | null> {
  const select = 'id,object_key,storage_provider,file_type,file_size,file_hash,preview_status,preview_source_hash,preview_converter_version';
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=${select}`, { headers: supabaseHeaders(env) });
  if (!response.ok) throw Object.assign(new Error('file_lookup_failed'), { code: 'database_unavailable' });
  const rows = await response.json() as ConverterFile[];
  return rows[0] ?? null;
}

async function markFailed(env: Env, job: OfficePreviewJob, code: string): Promise<void> {
  await rpc(env, 'fail_office_preview', {
    p_file_id: job.file_id,
    p_source_hash: job.source_hash,
    p_converter_version: job.converter_version,
    p_error_code: safeErrorCode(code),
  });
}

async function releaseForRetry(env: Env, job: OfficePreviewJob, code: string): Promise<void> {
  await rpc(env, 'release_office_preview_for_retry', {
    p_file_id: job.file_id,
    p_source_hash: job.source_hash,
    p_converter_version: job.converter_version,
    p_error_code: safeErrorCode(code),
  });
}

async function convertJob(env: Env, job: OfficePreviewJob): Promise<'done' | 'stale'> {
  const file = await fetchFile(env, job.file_id);
  if (!file) return 'stale';
  if (file.file_hash !== job.source_hash || file.preview_source_hash !== job.source_hash
      || file.preview_converter_version !== job.converter_version) return 'stale';
  if (file.preview_status === 'ready') return 'done';
  if (file.storage_provider !== 'r2' || !file.object_key) {
    throw Object.assign(new Error('source_mismatch'), { code: 'source_mismatch' });
  }
  const extension = (file.file_type ?? '').toLowerCase();
  if (!['doc', 'docx', 'ppt', 'pptx'].includes(extension)) {
    throw Object.assign(new Error('source_mismatch'), { code: 'source_mismatch' });
  }
  if (!file.file_size || file.file_size > MAX_SOURCE_BYTES) {
    throw Object.assign(new Error('input_too_large'), { code: 'input_too_large' });
  }

  const claimed = await rpc<boolean>(env, 'claim_office_preview_conversion', {
    p_file_id: job.file_id,
    p_source_hash: job.source_hash,
    p_converter_version: job.converter_version,
    p_lease_seconds: 120,
  });
  if (!claimed) return 'stale';

  const source = await env.FILES_BUCKET.get(file.object_key);
  if (!source) throw Object.assign(new Error('source_object_missing'), { code: 'source_object_missing' });
  if (source.size !== file.file_size) throw Object.assign(new Error('source_mismatch'), { code: 'source_mismatch' });

  const container = await getRandom(env.OFFICE_CONVERTER, CONVERTER_INSTANCES);
  const response = await container.fetch(new Request('http://office-converter/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(source.size),
      'X-File-Id': file.id,
      'X-File-Extension': extension,
    },
    body: source.body,
  }));
  if (!response.ok) {
    const code = safeErrorCode(response.headers.get('X-Conversion-Error'));
    throw Object.assign(new Error(code), { code });
  }
  const rawContentLength = response.headers.get('Content-Length');
  const contentLength = rawContentLength === null ? 0 : Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw Object.assign(new Error('invalid_output_length'), { code: 'invalid_pdf_output' });
  }
  if (contentLength > MAX_PREVIEW_BYTES) throw Object.assign(new Error('output_too_large'), { code: 'output_too_large' });
  // The generated PDF is bounded to 50 MB and intentionally buffered once.
  // This permits signature validation and prevents an unverified partial
  // derivative from being persisted in R2. Container concurrency is capped at 2.
  const pdf = new Uint8Array(await response.arrayBuffer());
  if (pdf.byteLength > MAX_PREVIEW_BYTES) throw Object.assign(new Error('output_too_large'), { code: 'output_too_large' });
  if (!hasPdfSignature(pdf)) throw Object.assign(new Error('invalid_pdf_output'), { code: 'invalid_pdf_output' });

  const previewKey = buildPreviewKey(job);
  await env.FILES_BUCKET.put(previewKey, pdf, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
    customMetadata: { sourceHash: job.source_hash, converterVersion: job.converter_version },
  });

  const completed = await rpc<boolean>(env, 'complete_office_preview', {
    p_file_id: job.file_id,
    p_source_hash: job.source_hash,
    p_converter_version: job.converter_version,
    p_object_key: previewKey,
    p_pdf_size: pdf.byteLength,
  });
  if (!completed) {
    await env.FILES_BUCKET.delete(previewKey);
    throw Object.assign(new Error('stale_completion'), { code: 'stale_completion' });
  }
  return 'done';
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response('Not found', { status: 404 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (!isValidPreviewJob(message.body)) {
        message.ack();
        continue;
      }
      const job = message.body;
      try {
        await convertJob(env, job);
        message.ack();
      } catch (error) {
        const code = safeErrorCode((error as { code?: unknown })?.code);
        const finalAttempt = message.attempts >= 3;
        if (isPermanentConversionError(code) || finalAttempt) {
          await markFailed(env, job, code).catch(() => {});
          message.ack();
        } else {
          await releaseForRetry(env, job, code).catch(() => {});
          message.retry({ delaySeconds: 30 });
        }
      }
    }
  },
};

export { convertJob };
