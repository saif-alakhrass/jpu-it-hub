import { beforeEach, describe, expect, it, vi } from 'vitest';

const containerMocks = vi.hoisted(() => ({ getRandom: vi.fn() }));

vi.mock('@cloudflare/containers', () => ({
  Container: class {},
  getRandom: containerMocks.getRandom,
}));

import converterWorker, { convertJob, MAX_PREVIEW_BYTES, MAX_SOURCE_BYTES } from '../src/index';

const job = {
  file_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  source_hash: 'a'.repeat(64),
  converter_version: 'v1',
};

function fileRow(fileSize = 1024) {
  return {
    id: job.file_id,
    object_key: `uploads/${job.file_id}.pptx`,
    storage_provider: 'r2',
    file_type: 'pptx',
    file_size: fileSize,
    file_hash: job.source_hash,
    preview_status: 'queued',
    preview_source_hash: job.source_hash,
    preview_converter_version: job.converter_version,
  };
}

function makeEnv(sourceSize = 1024) {
  return {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only',
    OFFICE_CONVERTER: {} as DurableObjectNamespace,
    FILES_BUCKET: {
      get: vi.fn().mockResolvedValue({
        size: sourceSize,
        // Uint8Array is accepted by both Node's Request and the Workers runtime;
        // using a Node ReadableStream here would require its non-standard duplex flag.
        body: new Uint8Array(sourceSize),
      }),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('converter size and integrity safeguards', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    containerMocks.getRandom.mockReset();
  });

  it('rejects an oversized source before claiming or reading R2', async () => {
    const env = makeEnv();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([fileRow(MAX_SOURCE_BYTES + 1)])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(convertJob(env as never, job)).rejects.toMatchObject({ code: 'input_too_large' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(env.FILES_BUCKET.get).not.toHaveBeenCalled();
    expect(containerMocks.getRandom).not.toHaveBeenCalled();
  });

  it('ignores missing, changed, and already-completed jobs idempotently', async () => {
    const env = makeEnv();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...fileRow(), file_hash: 'b'.repeat(64) }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...fileRow(), preview_status: 'ready' }])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(convertJob(env as never, job)).resolves.toBe('stale');
    await expect(convertJob(env as never, job)).resolves.toBe('stale');
    await expect(convertJob(env as never, job)).resolves.toBe('done');
    expect(env.FILES_BUCKET.get).not.toHaveBeenCalled();
  });

  it('stores a validated PDF under the deterministic preview key', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow()])))
      .mockResolvedValueOnce(new Response('true'))
      .mockResolvedValueOnce(new Response('true')));
    containerMocks.getRandom.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(new Response('%PDF-1.7', {
        status: 200, headers: { 'Content-Length': '8' },
      })),
    });

    await expect(convertJob(env as never, job)).resolves.toBe('done');
    expect(env.FILES_BUCKET.put).toHaveBeenCalledWith(
      `previews/${job.file_id}/${job.source_hash}-v1.pdf`,
      expect.any(Uint8Array),
      expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: 'application/pdf' }) }),
    );
  });

  it('rejects an oversized declared PDF before buffering the response', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow()])))
      .mockResolvedValueOnce(new Response('true')));
    const arrayBuffer = vi.fn();
    containerMocks.getRandom.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'Content-Length': String(MAX_PREVIEW_BYTES + 1) }),
        arrayBuffer,
      }),
    });

    await expect(convertJob(env as never, job)).rejects.toMatchObject({ code: 'output_too_large' });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(env.FILES_BUCKET.put).not.toHaveBeenCalled();
  });

  it('rejects invalid PDF bytes after reading as defense in depth', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow()])))
      .mockResolvedValueOnce(new Response('true')));
    containerMocks.getRandom.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(new Response('not-a-pdf', {
        status: 200,
        headers: { 'Content-Length': '9' },
      })),
    });

    await expect(convertJob(env as never, job)).rejects.toMatchObject({ code: 'invalid_pdf_output' });
    expect(env.FILES_BUCKET.put).not.toHaveBeenCalled();
  });

  it('deletes a generated derivative when a stale completion is refused', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow()])))
      .mockResolvedValueOnce(new Response('true'))
      .mockResolvedValueOnce(new Response('false')));
    containerMocks.getRandom.mockResolvedValue({
      fetch: vi.fn().mockResolvedValue(new Response('%PDF-1.7', {
        status: 200,
        headers: { 'Content-Length': '8' },
      })),
    });

    await expect(convertJob(env as never, job)).rejects.toMatchObject({ code: 'stale_completion' });
    expect(env.FILES_BUCKET.delete).toHaveBeenCalledWith(`previews/${job.file_id}/${job.source_hash}-v1.pdf`);
  });

  it('rejects a changed R2 object before starting the container', async () => {
    const env = makeEnv(512);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow()])))
      .mockResolvedValueOnce(new Response('true')));
    await expect(convertJob(env as never, job)).rejects.toMatchObject({ code: 'source_mismatch' });
    expect(containerMocks.getRandom).not.toHaveBeenCalled();
  });
});

describe('converter Worker delivery behavior', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    containerMocks.getRandom.mockReset();
  });

  it('serves only its health endpoint', async () => {
    await expect((await converterWorker.fetch(new Request('https://converter.test/health'))).json()).resolves.toEqual({ status: 'ok' });
    expect((await converterWorker.fetch(new Request('https://converter.test/unknown'))).status).toBe(404);
  });

  it('acknowledges malformed and permanent-failure queue messages', async () => {
    const env = makeEnv();
    const invalid = { body: { file_id: '../../bad' }, ack: vi.fn(), retry: vi.fn(), attempts: 1 };
    const oversized = { body: job, ack: vi.fn(), retry: vi.fn(), attempts: 1 };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow(MAX_SOURCE_BYTES + 1)])))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));

    await converterWorker.queue({ messages: [invalid, oversized] } as never, env as never);

    expect(invalid.ack).toHaveBeenCalledOnce();
    expect(oversized.ack).toHaveBeenCalledOnce();
    expect(oversized.retry).not.toHaveBeenCalled();
  });

  it('releases the lease and retries transient infrastructure failures', async () => {
    const env = makeEnv();
    const message = { body: job, ack: vi.fn(), retry: vi.fn(), attempts: 1 };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([fileRow()])))
      .mockResolvedValueOnce(new Response('database down', { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));

    await converterWorker.queue({ messages: [message] } as never, env as never);

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  });
});
