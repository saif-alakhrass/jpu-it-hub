export function normalizeArabic(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .toLowerCase()
    .trim();
}

export function smartMatch(text: string, query: string): boolean {
  const normalizedQuery = normalizeArabic(query);
  return !normalizedQuery || normalizeArabic(text).includes(normalizedQuery);
}
