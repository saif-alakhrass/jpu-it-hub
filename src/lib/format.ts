/** Short Arabic date used across cards, tables and notification lists. */
export function formatArabicDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('ar');
}

/** Long Arabic date used inside generated batch titles. */
export function formatArabicLongDate(value: string | number | Date = new Date()): string {
  return new Date(value).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function buildBatchTitle(tabLabel: string, count: number): string {
  return `${tabLabel} - مجموعة (${count} ملفات) - ${formatArabicLongDate()}`;
}
