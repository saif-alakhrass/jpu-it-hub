/**
 * CORS handling utilities
 */

import type { Env } from './env';

export function getCorsHeaders(env: Env, origin: string | null): Headers {
  const allowed = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((o) => o.trim());
  // Permit only Vercel preview deployments for this project/team. Preview
  // hostnames are generated per deployment, so enumerating one URL would make
  // the next preview fail CORS again.
  const isProjectPreview = origin !== null
    && /^https:\/\/jpu-it-[a-z0-9]+-jpu-it-hub\.vercel\.app$/.test(origin);
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Object-Key',
    'Access-Control-Max-Age': '86400',
  });
  if (origin && (allowed.includes(origin) || isProjectPreview)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

export function corsResponse(env: Env, request: Request, status: number, body?: unknown, contentType = 'application/json'): Response {
  const origin = request.headers.get('Origin');
  const headers = getCorsHeaders(env, origin);
  headers.set('Content-Type', contentType);
  return new Response(body !== undefined ? JSON.stringify(body) : null, { status, headers });
}

export function corsError(env: Env, request: Request, status: number, message: string): Response {
  return corsResponse(env, request, status, { error: message });
}