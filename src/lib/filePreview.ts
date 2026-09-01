/**
 * Phones and touch-first devices get the dedicated reader shell, while
 * pointer-first desktop screens keep the existing modal preview.
 */
export function shouldUseMobileReader(viewportWidth: number, maxTouchPoints: number): boolean {
  return viewportWidth < 768 || maxTouchPoints > 0;
}
