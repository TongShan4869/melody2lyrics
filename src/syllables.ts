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
