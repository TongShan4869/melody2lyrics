import { describe, expect, it } from 'vitest';
import { finalVowel, isOpenVowel } from './vowels';

describe('finalVowel', () => {
  it('returns ARPAbet final vowel for known words', () => {
    expect(finalVowel('day')).toBe('EY');
    expect(finalVowel('you')).toBe('UW');
    expect(finalVowel('see')).toBe('IY');
    expect(finalVowel('night')).toBe('AY');
    expect(finalVowel('love')).toBe('AH');
  });

  it('is case-insensitive and strips punctuation', () => {
    expect(finalVowel('Day.')).toBe('EY');
    expect(finalVowel('You,')).toBe('UW');
  });

  it('returns null for unknown words', () => {
    expect(finalVowel('xyzzy')).toBeNull();
  });
});

describe('isOpenVowel', () => {
  it('treats sustainable vowels as open', () => {
    expect(isOpenVowel('EY')).toBe(true);
    expect(isOpenVowel('AY')).toBe(true);
    expect(isOpenVowel('OW')).toBe(true);
    expect(isOpenVowel('UW')).toBe(true);
    expect(isOpenVowel('IY')).toBe(true);
  });

  it('treats closed and reduced vowels as not open', () => {
    expect(isOpenVowel('AH')).toBe(false);
    expect(isOpenVowel('IH')).toBe(false);
    expect(isOpenVowel('UH')).toBe(false);
    expect(isOpenVowel('EH')).toBe(false);
  });
});
