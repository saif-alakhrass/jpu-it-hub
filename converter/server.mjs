import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8080;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 90_000;
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendError(response, status, code) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Conversion-Error': code,
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify({ error: code }));
}

async function readRequestBody(request) {
  const rawLength = request.headers['content-length'];
  if (rawLength !== undefined) {
    const declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw Object.assign(new Error('invalid_content_length'), { code: 'invalid_request' });
    }
    if (declaredLength > MAX_INPUT_BYTES) {
      throw Object.assign(new Error('input_too_large'), { code: 'input_too_large' });
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw Object.assign(new Error('input_too_large'), { code: 'input_too_large' });
    chunks.push(chunk);
  }
  if (size < 4) throw Object.assign(new Error('empty_input'), { code: 'empty_input' });
  if (rawLength !== undefined && size !== Number(rawLength)) {
    throw Object.assign(new Error('input_length_mismatch'), { code: 'source_mismatch' });
  }
  // A 20 MB source is intentionally buffered once for signature validation
  // and an atomic temp-file write. Queue/container concurrency is capped at 2.
  return Buffer.concat(chunks, size);
}

function hasExpectedOfficeSignature(input, extension) {
  if (['docx', 'pptx'].includes(extension)) {
    return input.length >= 4
      && input[0] === 0x50
      && input[1] === 0x4b
      && [[0x03, 0x04], [0x05, 0x06], [0x07, 0x08]]
        .some(([third, fourth]) => input[2] === third && input[3] === fourth);
  }
  // Legacy .doc/.ppt files use the OLE Compound File signature.
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return input.length >= ole.length && ole.every((byte, index) => input[index] === byte);
}

function runLibreOffice(inputPath, outputDirectory, profileDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/soffice', [
      '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--nolockcheck',
      `-env:UserInstallation=file://${profileDirectory}`,
      '--convert-to', 'pdf', '--outdir', outputDirectory, inputPath,
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { PATH: '/usr/bin:/bin', HOME: profileDirectory, TMPDIR: profileDirectory, LANG: 'C.UTF-8' },
    });
    let diagnostics = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { diagnostics = `${diagnostics}${chunk}`.slice(-8192); });
    let timedOut = false;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CONVERSION_TIMEOUT_MS);
    child.once('error', () => {
      finish(() => reject(Object.assign(new Error('converter_unavailable'), { code: 'converter_unavailable' })));
    });
    child.once('exit', (code) => {
      if (timedOut) {
        finish(() => reject(Object.assign(new Error('conversion_timeout'), { code: 'conversion_timeout' })));
      } else if (code === 0) {
        finish(resolve);
      } else {
        finish(() => reject(Object.assign(new Error(`conversion_failed:${diagnostics}`), { code: 'conversion_failed' })));
      }
    });
  });
}

async function convert(request, response) {
  const fileId = request.headers['x-file-id'];
  const extension = String(request.headers['x-file-extension'] || '').toLowerCase();
  if (!UUID_RE.test(String(fileId || '')) || !OFFICE_EXTENSIONS.has(extension)) {
    sendError(response, 400, 'invalid_request');
    return;
  }

  const rawLength = request.headers['content-length'];
  const declaredLength = rawLength === undefined ? null : Number(rawLength);
  if (declaredLength !== null && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
    sendError(response, 400, 'invalid_request');
    return;
  }
  if (declaredLength !== null && declaredLength > MAX_INPUT_BYTES) {
    sendError(response, 413, 'input_too_large');
    return;
  }

  const workspace = await mkdtemp(join(tmpdir(), 'office-preview-'));
  try {
    const input = await readRequestBody(request);
    if (!hasExpectedOfficeSignature(input, extension)) {
      throw Object.assign(new Error('source_signature_mismatch'), { code: 'source_signature_mismatch' });
    }
    const inputDirectory = join(workspace, 'input');
    const outputDirectory = join(workspace, 'output');
    const profileDirectory = join(workspace, 'profile');
    await Promise.all([
      mkdir(inputDirectory, { recursive: true }),
      mkdir(outputDirectory, { recursive: true }),
      mkdir(profileDirectory, { recursive: true }),
    ]);
    const inputPath = join(inputDirectory, `${fileId}.${extension}`);
    await writeFile(inputPath, input, { mode: 0o600 });
    await runLibreOffice(inputPath, outputDirectory, profileDirectory);
    const pdfPath = join(outputDirectory, `${fileId}.pdf`);
    const pdfStats = await stat(pdfPath);
    if (pdfStats.size > MAX_OUTPUT_BYTES) throw Object.assign(new Error('output_too_large'), { code: 'output_too_large' });
    // LibreOffice output is capped at 50 MB and intentionally buffered once so
    // its signature and exact length are verified before any R2 write occurs.
    const pdf = await readFile(pdfPath);
    if (pdf.length > MAX_OUTPUT_BYTES) throw Object.assign(new Error('output_too_large'), { code: 'output_too_large' });
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw Object.assign(new Error('invalid_pdf_output'), { code: 'invalid_pdf_output' });
    }
    response.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(pdf);
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'conversion_failed';
    sendError(response, code === 'input_too_large' ? 413 : 422, code);
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method === 'POST' && request.url === '/convert') {
    void convert(request, response);
    return;
  }
  sendError(response, 404, 'not_found');
});

server.requestTimeout = 95_000;
server.headersTimeout = 10_000;
server.listen(PORT, '0.0.0.0');
