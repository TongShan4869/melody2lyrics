import { describe, expect, it } from 'vitest';
import { lockTemplate, parseLockInput, validateLockedWords } from './locks';

describe('lock parsing', () => {
  it('parses placeholders and locked words', () => {
    const lock = parseLockInput('_ _ love _ _', 0);
    expect(lock.totalSyllables).toBe(5);
    expect(lockTemplate(lock, 5)).toBe('[?] [?] love [?] [?]');
  });

  it('supports syllable overrides', () => {
    const lock = parseLockInput('fire:1 _ _ _', 0);
    expect(lock.totalSyllables).toBe(4);
  });

  it('detects missing locked words in generated output', () => {
    const lock = parseLockInput('_ morning _', 0);
    expect(validateLockedWords('the dawning breaks', lock).valid).toBe(false);
  });

  it('accepts locked words in order', () => {
    const lock = parseLockInput('_ love _ tonight', 0);
    expect(validateLockedWords('we love you tonight', lock).valid).toBe(true);
  });
});
