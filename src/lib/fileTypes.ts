import type { FileRow } from '@/lib/types';

export const IMAGE_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
export const DOCUMENT_EXTENSIONS: readonly string[] = ['doc', 'docx'];
export const SLIDE_EXTENSIONS: readonly string[] = ['ppt', 'pptx'];
export const OFFICE_EXTENSIONS: readonly string[] = [...DOCUMENT_EXTENSIONS, ...SLIDE_EXTENSIONS];

function extension(type?: string | null): string {
  return (type ?? '').toLowerCase();
}

export function isImageType(type?: string | null): boolean {
  return IMAGE_EXTENSIONS.includes(extension(type));
}

export function isPdfType(type?: string | null): boolean {
  return extension(type) === 'pdf';
}

export function isOfficeType(type?: string | null): boolean {
  return OFFICE_EXTENSIONS.includes(extension(type));
}

export function isImageFile(file: Pick<FileRow, 'mime_type' | 'file_type'>): boolean {
  return (file.mime_type ?? '').startsWith('image/') || isImageType(file.file_type);
}

export function isPdfFile(file: Pick<FileRow, 'mime_type' | 'file_type'>): boolean {
  return file.mime_type === 'application/pdf' || isPdfType(file.file_type);
}

export function isOfficeFile(file: Pick<FileRow, 'file_type'>): boolean {
  return isOfficeType(file.file_type);
}

export function officePreviewUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

export function getFileIcon(fileType?: string | null): string {
  const ext = extension(fileType);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'Image';
  if (ext === 'pdf') return 'FileText';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'FileType';
  if (SLIDE_EXTENSIONS.includes(ext)) return 'Presentation';
  return 'File';
}
