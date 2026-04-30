import { describe, expect, it } from 'vitest';
import { syllableValidator, lockedWordsValidator, endCollisionValidator, fillerEndingValidator, heldVowelValidator } from './validators';
import type { Phrase } from './types';
import { parseLockInput } from './locks';

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

describe('lockedWordsValidator', () => {
  it('passes when locked words appear in order', () => {
    const lock = parseLockInput('_ love _ you', 0);
    expect(lockedWordsValidator('I love being with you', lock)).toBeNull();
  });

  it('fails when a locked word is missing', () => {
    const lock = parseLockInput('_ love _ you', 0);
    const result = lockedWordsValidator('I miss being with you', lock);
    expect(result).toEqual({
      type: 'locked-words',
      message: expect.stringContaining('love'),
    });
  });

  it('passes when there are no locked words', () => {
    const lock = parseLockInput('', 0);
    expect(lockedWordsValidator('anything goes here', lock)).toBeNull();
  });
});

describe('endCollisionValidator', () => {
  it('passes when section lines have unique end words', () => {
    const lines = ['I see the rain', 'falling on me', 'taking it slow'];
    const sections = ['Verse 1', 'Verse 1', 'Verse 1'];
    expect(endCollisionValidator(lines, sections, 0)).toBeNull();
    expect(endCollisionValidator(lines, sections, 1)).toBeNull();
    expect(endCollisionValidator(lines, sections, 2)).toBeNull();
  });

  it('fails when two lines in the same section share their end word', () => {
    const lines = ['into the night', 'shining so bright', 'wide awake tonight'];
    const sections = ['Verse 1', 'Verse 1', 'Verse 1'];
    const result = endCollisionValidator(lines, sections, 2);
    expect(result).toBeNull();
    const a = endCollisionValidator([
      'falling for you',
      'reaching for you',
    ], ['Verse 1', 'Verse 1'], 1);
    expect(a).toEqual({
      type: 'end-collision',
      message: expect.stringContaining('you'),
    });
  });

  it('does not flag collisions across different sections', () => {
    const lines = ['falling for you', 'reaching for you'];
    const sections = ['Verse 1', 'Chorus 1'];
    expect(endCollisionValidator(lines, sections, 1)).toBeNull();
  });

  it('strips punctuation and is case-insensitive', () => {
    const lines = ['I am here.', 'You are HERE!'];
    const sections = ['Verse 1', 'Verse 1'];
    const result = endCollisionValidator(lines, sections, 1);
    expect(result?.type).toBe('end-collision');
  });
});

describe('fillerEndingValidator', () => {
  it('fails when line ends in a default filler word', () => {
    const result = fillerEndingValidator('falling through the night', '');
    expect(result).toEqual({
      type: 'filler',
      message: expect.stringContaining('night'),
    });
  });

  it('passes when filler word is in mustInclude', () => {
    expect(fillerEndingValidator('falling through the night', 'night, dream')).toBeNull();
  });

  it('passes for non-filler endings', () => {
    expect(fillerEndingValidator('I will see you soon', '')).toBeNull();
  });
});

const note = (duration: number): import('./types').AnalyzedNote => ({
  id: 'n', midi: 60, pitch: 'C4', time: 0, duration, velocity: 0.8,
  stressScore: 0.5, stress: 'w',
});

const phraseWith = (durations: number[]): Phrase => ({
  id: 'p',
  notes: durations.map(note),
  syllables: durations.length,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

describe('heldVowelValidator', () => {
  it('passes when final note is not held', () => {
    const phrase = phraseWith([1, 1, 1, 1]); // all equal -> none held
    expect(heldVowelValidator('I am right here', phrase)).toBeNull();
  });

  it('passes when final note is held and ends in an open vowel', () => {
    const phrase = phraseWith([0.25, 0.25, 0.25, 1.5]); // last note held
    expect(heldVowelValidator('walking far away', phrase)).toBeNull();
  });

  it('fails when final note is held and ends in a closed vowel', () => {
    const phrase = phraseWith([0.25, 0.25, 0.25, 1.5]);
    const result = heldVowelValidator('something I love', phrase);
    expect(result).toEqual({
      type: 'held-vowel',
      message: expect.any(String),
    });
  });

  it('passes when final word is unknown (skip)', () => {
    const phrase = phraseWith([0.25, 0.25, 0.25, 1.5]);
    expect(heldVowelValidator('whispering xyzzy', phrase)).toBeNull();
  });
});
