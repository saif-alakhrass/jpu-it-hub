export function officePreviewUrl(fileUrl: string, embedded: boolean): string {
  const mode = embedded ? 'embed' : 'view';
  return `https://view.officeapps.live.com/op/${mode}.aspx?src=${encodeURIComponent(fileUrl)}`;
}

export function mobileOfficePreviewUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}`;
}

export type BrowserOfficePreviewKind = 'pptx' | 'docx' | null;

/**
 * Only OOXML documents can be decoded safely by the browser viewers. Legacy
 * binary .ppt/.doc files keep the external-viewer fallback.
 */
export function getBrowserOfficePreviewKind(fileType: string | null | undefined): BrowserOfficePreviewKind {
  const extension = (fileType ?? '').trim().toLowerCase().replace(/^\./, '');
  if (extension === 'pptx') return 'pptx';
  if (extension === 'docx') return 'docx';
  return null;
}

export function clampOfficeZoom(value: number): number {
  return Math.min(200, Math.max(50, Math.round(value / 10) * 10));
}

/**
 * Nested Office iframes do not handle touch gestures reliably. Phones and
 * touch-first tablets use Microsoft's full-page viewer instead.
 */
export function shouldUseFullPagePreview(viewportWidth: number, maxTouchPoints: number): boolean {
  return viewportWidth < 768 || maxTouchPoints > 0;
}
