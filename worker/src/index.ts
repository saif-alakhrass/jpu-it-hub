/**
 * JPU-IT Hub — Cloudflare Worker: R2 Storage Proxy
 *
 * Main entry point that imports from modularized components
 */

import type { Env } from './env';
import { validateEnvironment } from './env';
import { corsResponse, corsError } from './cors';
import { verifyJwt, extractToken } from './jwt';
import { authenticateWithProfile } from './supabase';
import {
  handleUploadPresign,
  handleUploadProxy,
  handleConfirmUpload,
  handleDownloadPresign,
  handleDelete,
  handleVerifyHash,
} from './handlers';
import { startCleanupScheduler } from './orphanFiles';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Validate environment on startup
    const envValidation = validateEnvironment(env);
    if (!envValidation.valid) {
      console.error('Environment validation failed:', envValidation.errors);
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Start cleanup scheduler
    startCleanupScheduler(env);

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

      // Supabase validates the access token at its RLS boundary on every
      // request, then returns only the caller's own profile.
      const profile = await authenticateWithProfile(env, token);
      if (!profile) {
        return corsError(env, request, 401, 'Invalid or expired token');
      }

      const userId = profile.id;
      if (!userId) {
        return corsError(env, request, 401, 'Invalid token: missing subject');
      }

      const isAdmin = profile.role === 'admin';

      // Route: POST /upload-presign — get a presigned PUT URL for uploading
      if (path === '/upload-presign' && request.method === 'POST') {
        return handleUploadPresign(env, request, userId, profile.role);
      }

      // Route: PUT /upload-proxy — CORS-safe fallback if a browser cannot
      // complete a direct presigned R2 upload.
      if (path === '/upload-proxy' && request.method === 'PUT') {
        return handleUploadProxy(env, request, userId);
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