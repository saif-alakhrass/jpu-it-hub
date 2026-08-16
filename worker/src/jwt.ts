/**
 * JWT verification utilities
 */

import type { Env } from './env';
import type { JwtPayload } from './types';

interface JwtHeader {
  alg: 'HS256' | 'ES256';
  kid?: string;
}

interface JwksResponse {
  keys: Array<JsonWebKey & { kid?: string }>;
}

interface SupabaseAuthUser {
  id: string;
  email?: string;
}

export async function verifyWithSupabase(token: string, env: Env): Promise<SupabaseAuthUser | null> {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!response.ok) return null;
  const user = await response.json() as SupabaseAuthUser;
  return user.id ? user : null;
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

async function verifyEs256(
  header: JwtHeader,
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  env: Env,
): Promise<boolean> {
  if (!header.kid) return false;
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
  if (!response.ok) return false;
  const jwks = await response.json() as JwksResponse;
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === 'EC' && key.crv === 'P-256');
  if (!jwk) return false;

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    decodeBase64Url(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
}

export async function verifyJwt(token: string, env: Env): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const header = decodeJson<JwtHeader>(headerB64);
  const payload = decodeJson<JwtPayload>(payloadB64);
  if (!header || !payload) return null;

  // Verify signature based on algorithm
  let signatureValid = false;
  
  if (header.alg === 'ES256') {
    try {
      signatureValid = await verifyEs256(header, headerB64, payloadB64, signatureB64, env);
    } catch {
      signatureValid = false;
    }
  } else if (header.alg === 'HS256') {
    try {
      if (env.JWT_SECRET) {
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(env.JWT_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        signatureValid = await crypto.subtle.verify(
          'HMAC',
          key,
          decodeBase64Url(signatureB64),
          new TextEncoder().encode(`${headerB64}.${payloadB64}`),
        );
      }
    } catch {
      signatureValid = false;
    }
  } else {
    return null; // Unsupported algorithm
  }

  // Fallback to Supabase verification if local verification fails
  if (!signatureValid) {
    const user = await verifyWithSupabase(token, env);
    if (!user || user.id !== payload.sub) return null;
  }

  // Validate payload
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;

  const expectedIssuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  if (payload.iss !== expectedIssuer || payload.aud !== 'authenticated' || !payload.sub) return null;

  return payload;
}

export function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? (match[1] ?? '') : null;
}