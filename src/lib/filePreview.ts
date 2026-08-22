export function officePreviewUrl(fileUrl: string, embedded: boolean): string {
  const mode = embedded ? 'embed' : 'view';
  return `https://view.officeapps.live.com/op/${mode}.aspx?src=${encodeURIComponent(fileUrl)}`;
}

/**
 * Nested Office iframes do not handle touch gestures reliably. Phones and
 * touch-first tablets use Microsoft's full-page viewer instead.
 */
export function shouldUseFullPageOfficePreview(viewportWidth: number, maxTouchPoints: number): boolean {
  return viewportWidth < 768 || maxTouchPoints > 0;
}
