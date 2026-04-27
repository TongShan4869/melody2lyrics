import type { LockToken, PhraseLockState } from './types';
import { countSyllables, displayWord } from './syllables';

export function parseLockInput(rawInput: string, phraseIndex: number, existingPolicy: PhraseLockState['policy'] = 'strict'): PhraseLockState {
  const tokens: LockToken[] = rawInput
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === '_') return { kind: 'free', syllables: 1 };
      return { kind: 'locked', word: displayWord(token), syllables: countSyllables(token) };
    });

  return {
    phraseIndex,
    rawInput,
    tokens,
    totalSyllables: tokens.reduce((sum, token) => sum + token.syllables, 0),
    policy: existingPolicy,
    lockedAfterGeneration: false,
  };
}

export function lockTemplate(lock: PhraseLockState, targetSyllables: number): string {
  if (!lock.rawInput.trim()) return 'open';

  const parts: string[] = [];
  for (const token of lock.tokens) {
    if (token.kind === 'free') {
      parts.push('[?]');
    } else {
      parts.push(token.word);
    }
  }

  if (lock.totalSyllables < targetSyllables && lock.policy !== 'strict') {
    const missing = targetSyllables - lock.totalSyllables;
    parts.push(...Array.from({ length: missing }, () => '[?]'));
  }

  return parts.join(' ');
}

export function lockedWordsWithPositions(lock: PhraseLockState): Array<{ word: string; start: number; end: number; syllables: number }> {
  const words: Array<{ word: string; start: number; end: number; syllables: number }> = [];
  let cursor = 1;

  for (const token of lock.tokens) {
    if (token.kind === 'locked') {
      words.push({
        word: token.word,
        start: cursor,
        end: cursor + token.syllables - 1,
        syllables: token.syllables,
      });
    }
    cursor += token.syllables;
  }

  return words;
}

export function isFullyLocked(lock: PhraseLockState, targetSyllables: number): boolean {
  return Boolean(lock.rawInput.trim()) && lock.tokens.every((token) => token.kind === 'locked') && lock.totalSyllables === targetSyllables;
}

export function validateLockedWords(output: string, lock: PhraseLockState): { valid: boolean; message?: string } {
  const lockedWords = lock.tokens.filter((token): token is Extract<LockToken, { kind: 'locked' }> => token.kind === 'locked');
  if (lockedWords.length === 0) return { valid: true };

  const normalizedOutput = output.toLowerCase();
  let searchFrom = 0;

  for (const token of lockedWords) {
    const normalizedWord = token.word.toLowerCase();
    const index = normalizedOutput.indexOf(normalizedWord, searchFrom);
    if (index === -1) {
      return { valid: false, message: `Missing locked word "${token.word}".` };
    }
    searchFrom = index + normalizedWord.length;
  }

  return { valid: true };
}
