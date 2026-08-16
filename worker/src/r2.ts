/**
 * R2 storage utilities
 */

import type { Env } from './env';
import { ALLOWED_MIME_TYPES, DEFAULT_SIGNED_EXPIRY } from './constants';
import type { AllowedExt } from './constants';

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

export async function createPresignedUrl(
  env: Env,
  objectKey: string,
  method: 'GET' | 'PUT',
  expirySeconds: number,
  responseContentDisposition?: string,
): Promise<string> {
  const accountId = env.R2_ACCOUNT_ID;
  const bucketName = 'jpu-it-hub-files';
  const region = 'auto';
  const service = 's3';
  // R2's S3 endpoint uses path-style addressing, not bucket subdomains.
  const host = `${accountId}.r2.cloudflarestorage.com`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.substring(0, 8);

  const expiry = Math.min(expirySeconds, 604800); // max 7 days
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${env.R2_ACCESS_KEY_ID}/${credentialScope}`;

  const canonicalUriStr = `${bucketName}/${canonicalUri(objectKey)}`;
  const queryParts = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiry}`,
    `X-Amz-SignedHeaders=host`,
  ];
  if (responseContentDisposition) {
    queryParts.push(`response-content-disposition=${encodeURIComponent(responseContentDisposition)}`);
  }
  const canonicalQueryString = queryParts.sort().join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';

  const payloadHash = 'UNSIGNED-PAYLOAD';

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

export async function sha256(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(hash);
}