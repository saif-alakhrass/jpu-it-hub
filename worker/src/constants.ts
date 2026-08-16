/**
 * Constants for the worker
 */

export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'] as const;
export type AllowedExt = (typeof ALLOWED_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

// Magic-byte signatures for server-side file type verification.
export const MAGIC_BYTES: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47], // PNG
  jpg: [0xff, 0xd8, 0xff],       // JPEG
  doc: [0xd0, 0xcf, 0x11, 0xe0], // OLE2 (doc, ppt)
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP (docx, pptx)
  ppt: [0xd0, 0xcf, 0x11, 0xe0], // OLE2
  pptx: [0x50, 0x4b, 0x03, 0x04], // ZIP
};

export const DEFAULT_MAX_SIZE = 20 * 1024 * 1024; // 20 MB
export const DEFAULT_UPLOAD_WINDOW_MIN = 10;
export const DEFAULT_SIGNED_EXPIRY = 300; // 5 minutes
export const ORPHAN_FILE_TTL_MS = 30 * 60 * 1000; // 30 minutes