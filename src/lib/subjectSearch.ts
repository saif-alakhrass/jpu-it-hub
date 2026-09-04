import { normalizeArabic } from './arabicSearch';
import type { Subject } from './types';

// Search-only folding: preserve stored names and do not apply broad stemming
// (which could confuse distinct courses). All query words must match.
export function subjectWords(value: string): string[] {
  return normalizeArabic(value)
    .replace(/\u0640/g, '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (/^ال[\u0621-\u064A]{2}/.test(word) ? word.slice(2) : word));
}

function matchesWords(words: string[], query: string[]): boolean {
  return query.every((part) =>
    words.some((word) =>
      /^\d+$/.test(part) ? word === part : word.startsWith(part),
    ),
  );
}

export function searchSubjects(
  subjects: Subject[],
  query: string,
  includeDescription = false,
): Subject[] {
  const parts = subjectWords(query);
  if (!parts.length) return [];
  const phrase = [...parts].sort().join(' ');
  return subjects
    .map((subject, index) => {
      const name = subjectWords(subject.name);
      const code = subjectWords(subject.code ?? '');
      const exact =
        [...name].sort().join(' ') === phrase ||
        (code.length > 0 && [...code].sort().join(' ') === phrase);
      const score = exact
        ? 100
        : matchesWords(name, parts)
          ? 80
          : code.length > 0 && matchesWords(code, parts)
            ? 70
            : includeDescription &&
                matchesWords(
                  [...name, ...subjectWords(subject.description ?? '')],
                  parts,
                )
              ? 20
              : 0;
      return { subject, score, index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.subject);
}

export function matchSubject(name: string, subjects: Subject[]): string | null {
  const words = subjectWords(name);
  if (!words.length) return null;
  const phrase = [...words].sort().join(' ');
  const exact = subjects.filter(
    (s) =>
      subjectWords(s.name).sort().join(' ') === phrase ||
      (s.code && subjectWords(s.code).sort().join(' ') === phrase),
  );
  if (exact.length) return exact.length === 1 ? exact[0]!.id : null;
  // A short fragment may produce suggestions, but should not assign a course.
  if (words.join('').length < 3) return null;
  const candidates = searchSubjects(subjects, name);
  return candidates.length === 1 ? candidates[0]!.id : null;
}
