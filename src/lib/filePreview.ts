export function officePreviewUrl(fileUrl: string, embedded: boolean): string {
  const mode = embedded ? 'embed' : 'view';
  return `https://view.officeapps.live.com/op/${mode}.aspx?src=${encodeURIComponent(fileUrl)}`;
}

export function mobileOfficePreviewUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}`;
}

/**
 * Phones and touch-first devices get the dedicated reader shell, while
 * pointer-first desktop screens keep the existing modal preview.
 */
export function shouldUseMobileReader(viewportWidth: number, maxTouchPoints: number): boolean {
  return viewportWidth < 768 || maxTouchPoints > 0;
}
