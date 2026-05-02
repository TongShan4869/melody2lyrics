import { syllable } from 'syllable';

export function countSyllables(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;

  const override = trimmed.match(/^(.*):(\d+)$/);
  if (override) {
    return Math.max(0, Number(override[2]));
  }

  const cleaned = trimmed
    .replace(/^\\_$/, '_')
    .replace(/[^\w'’-]+/g, '')
    .replace(/[’]/g, "'");

  if (!cleaned) return 0;
  return Math.max(1, syllable(cleaned));
}

export function displayWord(input: string): string {
  const override = input.match(/^(.*):(\d+)$/);
  return (override ? override[1] : input).replace(/^\\_$/, '_');
}

// Visual syllable splitter — breaks a word into N pieces where N = countSyllables(word).
// Heuristic: split between consonant clusters that follow a vowel group.
// Good enough for live UI feedback; not a linguistic dictionary.
export function splitSyllables(word: string): string[] {
  const cleaned = word.replace(/[^a-zA-Z']/g, '');
  if (!cleaned) return [word];
  const target = countSyllables(cleaned);
  if (target <= 1) return [word];

  const lower = cleaned.toLowerCase();
  const isVowel = (c: string) => /[aeiouy]/.test(c);

  const pts: number[] = [];
  let i = 0;
  while (i < lower.length) {
    while (i < lower.length && isVowel(lower[i])) i += 1;
    const cStart = i;
    while (i < lower.length && !isVowel(lower[i])) i += 1;
    const cEnd = i;
    if (cStart > 0 && cEnd < lower.length && cEnd > cStart) {
      const splitAt = cEnd - cStart >= 2 ? cEnd - 1 : cStart;
      pts.push(splitAt);
    }
  }

  let chosen = pts;
  if (pts.length + 1 > target) {
    const step = pts.length / (target - 1);
    chosen = [];
    for (let k = 1; k < target; k += 1) {
      chosen.push(pts[Math.min(pts.length - 1, Math.round(k * step) - 1)]);
    }
    chosen = [...new Set(chosen)].sort((a, b) => a - b);
  }
  if (chosen.length === 0) return [word];

  const parts: string[] = [];
  let prev = 0;
  for (const p of chosen) {
    parts.push(cleaned.slice(prev, p));
    prev = p;
  }
  parts.push(cleaned.slice(prev));
  return parts.filter(Boolean);
}

export type LineSyllableWord = {
  word: string;
  syllables: string[];
};

export function splitLineSyllables(line: string): LineSyllableWord[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, syllables: splitSyllables(word) }));
}
