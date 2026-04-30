import type { Phrase, ValidationFailure } from './types';
import { countSyllables } from './syllables';

export function syllableValidator(
  line: string,
  phrase: Phrase,
  opts: { strict: boolean },
): ValidationFailure | null {
  const counted = line.trim().split(/\s+/).filter(Boolean)
    .reduce((sum, token) => sum + countSyllables(token), 0);
  const target = phrase.syllables;
  const diff = Math.abs(counted - target);
  const tolerance = opts.strict ? 0 : 1;
  if (diff <= tolerance) return null;
  return {
    type: 'syllables',
    message: `${counted} syllables, target ${target}`,
  };
}
