/**
 * Type definitions
 */

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

export interface FileRecord {
  id: string;
  title: string;
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

export interface Profile {
  id: string;
  role: 'admin' | 'trusted' | 'student';
}

export const UPLOAD_LIMITS_BY_ROLE: Record<Profile['role'], number> = {
  student: 10,
  trusted: 20,
  admin: 50,
};

export function getUploadLimit(role: Profile['role']): number {
  return UPLOAD_LIMITS_BY_ROLE[role];
}

export interface UploadPresignRequest {
  file_name: string;
  file_size: number;
  file_type: string;
  subject_id: string;
  tab: string;
  batch_id?: string | null;
}

export interface ConfirmUploadRequest {
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

export interface DownloadPresignRequest {
  file_id: string;
  mode?: 'preview' | 'download';
}

export interface DeleteRequest {
  file_id: string;
}

export interface VerifyHashRequest {
  file_hash: string;
  subject_id: string;
}