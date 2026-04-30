import { describe, expect, it } from 'vitest';
import { syllableValidator } from './validators';
import type { Phrase } from './types';

const phrase = (syllables: number): Phrase => ({
  id: 'p',
  notes: [],
  syllables,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

describe('syllableValidator', () => {
  it('passes when count matches', () => {
    const result = syllableValidator('hello world today', phrase(5), { strict: true });
    expect(result).toBeNull();
  });

  it('fails when count differs in strict mode', () => {
    const result = syllableValidator('hello world', phrase(5), { strict: true });
    expect(result).toEqual({
      type: 'syllables',
      message: expect.stringContaining('3'),
    });
  });

  it('allows ±1 when not strict', () => {
    expect(syllableValidator('hello world today now', phrase(5), { strict: false })).toBeNull();
    expect(syllableValidator('hello world ok', phrase(5), { strict: false })).toBeNull();
  });

  it('still fails ±2 when not strict', () => {
    const result = syllableValidator('hi there', phrase(5), { strict: false });
    expect(result).not.toBeNull();
  });
});
