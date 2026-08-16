/**
 * Environment configuration and validation
 */

export interface Env {
  FILES_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY?: string;
  JWT_SECRET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  CORS_ALLOWED_ORIGINS: string;
  MAX_FILE_SIZE_BYTES: string;
  UPLOAD_WINDOW_MINUTES: string;
  SIGNED_URL_EXPIRY_SECONDS: string;
}

function validateEnvironment(env: Env): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required R2 credentials
  if (!env.R2_ACCESS_KEY_ID) errors.push('R2_ACCESS_KEY_ID is required');
  if (!env.R2_SECRET_ACCESS_KEY) errors.push('R2_SECRET_ACCESS_KEY is required');
  if (!env.R2_ACCOUNT_ID) errors.push('R2_ACCOUNT_ID is required');
  
  // Required Supabase credentials
  if (!env.SUPABASE_URL) errors.push('SUPABASE_URL is required');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) errors.push('SUPABASE_SERVICE_ROLE_KEY is required');
  
  // Optional but recommended
  if (!env.JWT_SECRET) errors.push('JWT_SECRET is recommended for HS256 fallback');
  
  // Validate numeric values
  const maxSize = parseInt(env.MAX_FILE_SIZE_BYTES || '20971520', 10);
  if (isNaN(maxSize) || maxSize <= 0) errors.push('MAX_FILE_SIZE_BYTES must be a positive number');
  
  const uploadWindow = parseInt(env.UPLOAD_WINDOW_MINUTES || '10', 10);
  if (isNaN(uploadWindow) || uploadWindow <= 0) errors.push('UPLOAD_WINDOW_MINUTES must be a positive number');
  
  const signedExpiry = parseInt(env.SIGNED_URL_EXPIRY_SECONDS || '300', 10);
  if (isNaN(signedExpiry) || signedExpiry <= 0) errors.push('SIGNED_URL_EXPIRY_SECONDS must be a positive number');
  
  // Validate CORS origins format
  if (env.CORS_ALLOWED_ORIGINS) {
    const origins = env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim());
    const invalidOrigins = origins.filter(o => {
      try {
        new URL(o);
        return false;
      } catch {
        return true;
      }
    });
    if (invalidOrigins.length > 0) {
      errors.push(`Invalid CORS origins: ${invalidOrigins.join(', ')}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export { validateEnvironment };