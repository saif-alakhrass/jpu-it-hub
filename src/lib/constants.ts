import type { Role } from './types';

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ALLOWED_EXTENSIONS: readonly string[] = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg',
];

export const ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
];

export const ROLES: Role[] = ['admin', 'trusted', 'student'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'مدير',
  trusted: 'موثوق',
  student: 'طالب',
};

export const UPLOAD_MAX_PER_WINDOW_BY_ROLE: Record<Role, number> = {
  student: 10,
  trusted: 20,
  admin: 50,
};

// Use the student limit until a signed-in user's role is available.
export const UPLOAD_MAX_PER_WINDOW = UPLOAD_MAX_PER_WINDOW_BY_ROLE.student;

export function getUploadLimit(role: Role | null | undefined): number {
  return role ? UPLOAD_MAX_PER_WINDOW_BY_ROLE[role] : UPLOAD_MAX_PER_WINDOW;
}
export const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

export const PAGE_SIZE = 20;
