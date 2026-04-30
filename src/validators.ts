import type { Phrase, ValidationFailure, PhraseLockState } from './types';
import { countSyllables } from './syllables';
import { validateLockedWords } from './locks';
import { DEFAULT_FILLER_END_WORDS } from './prompt';

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

export function lockedWordsValidator(
  line: string,
  lock: PhraseLockState,
): ValidationFailure | null {
  const result = validateLockedWords(line, lock);
  if (result.valid) return null;
  return {
    type: 'locked-words',
    message: result.message ?? 'locked-word mismatch',
  };
}

function endWord(line: string): string {
  const tokens = line.trim().toLowerCase().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? '';
  return last.replace(/[^a-z']/g, '');
}

export function endCollisionValidator(
  lines: string[],
  sectionLabels: string[],
  index: number,
): ValidationFailure | null {
  const section = sectionLabels[index] ?? '';
  const target = endWord(lines[index] ?? '');
  if (!target) return null;

  for (let i = 0; i < lines.length; i += 1) {
    if (i === index) continue;
    if ((sectionLabels[i] ?? '') !== section) continue;
    if (endWord(lines[i] ?? '') === target) {
      return {
        type: 'end-collision',
        message: `ends in "${target}" — collides with line ${i + 1}`,
      };
    }
  }
  return null;
}

function tokenizeMustInclude(raw: string): Set<string> {
  return new Set(
    raw.toLowerCase().split(/[,\s]+/).map((token) => token.trim()).filter(Boolean),
  );
}

export function fillerEndingValidator(
  line: string,
  mustInclude: string,
): ValidationFailure | null {
  const target = endWord(line);
  if (!target) return null;
  const allowed = tokenizeMustInclude(mustInclude);
  if (allowed.has(target)) return null;
  if ((DEFAULT_FILLER_END_WORDS as readonly string[]).includes(target)) {
    return {
      type: 'filler',
      message: `ends in default filler word "${target}"`,
    };
  }
  return null;
}
