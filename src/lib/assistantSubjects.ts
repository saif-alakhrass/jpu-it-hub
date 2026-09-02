import { normalizeArabic } from './arabicSearch';
import type { Subject } from './types';

export function matchSubject(name: string, subjects: Subject[]): string | null {
  const normalized = normalizeArabic(name);
  if (!normalized) return null;
  const matches = subjects.filter(
    (s) =>
      normalizeArabic(s.name) === normalized ||
      (s.code && normalizeArabic(s.code) === normalized),
  );
  return matches.length === 1 ? matches[0]!.id : null;
}
