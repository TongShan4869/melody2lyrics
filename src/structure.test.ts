import { describe, expect, it } from 'vitest';
import { detectSections, phraseSimilarity } from './structure';
import type { Phrase, AnalyzedNote } from './types';

const makeNote = (midi: number, duration: number): AnalyzedNote => ({
  id: `${midi}-${duration}`,
  midi,
  pitch: 'C4',
  time: 0,
  duration,
  velocity: 0.8,
  stressScore: 0.5,
  stress: 'w',
  length: 'S',
});

const makePhrase = (pitches: number[], durations: number[]): Phrase => ({
  id: 'p',
  notes: pitches.map((p, i) => makeNote(p, durations[i] ?? 1)),
  syllables: pitches.length,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

describe('phraseSimilarity', () => {
  it('returns ~1 for identical phrases', () => {
    const a = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const b = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    expect(phraseSimilarity(a, b)).toBeGreaterThan(0.95);
  });

  it('returns ~1 for transposed identical contour', () => {
    const a = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const b = makePhrase([67, 69, 71, 72], [1, 1, 1, 1]);
    expect(phraseSimilarity(a, b)).toBeGreaterThan(0.9);
  });

  it('returns low score for different contours', () => {
    const a = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const b = makePhrase([72, 65, 70, 60], [1, 1, 1, 1]);
    expect(phraseSimilarity(a, b)).toBeLessThan(0.7);
  });
});

describe('detectSections', () => {
  it('labels a single phrase as Verse 1', () => {
    const phrases = [makePhrase([60, 62, 64, 65], [1, 1, 1, 1])];
    expect(detectSections(phrases)).toEqual(['Verse 1']);
  });

  it('labels alternating verse/chorus with run-based numbering', () => {
    const verseA = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const verseB = makePhrase([65, 60, 67, 62], [1, 1, 1, 1]);
    const chorus = makePhrase([72, 70, 67, 65], [1, 1, 1, 2]);
    const labels = detectSections([verseA, chorus, verseB, chorus]);
    expect(labels).toEqual(['Verse 1', 'Chorus 1', 'Verse 2', 'Chorus 2']);
  });

  it('falls back to a single Verse run when no chorus repeats', () => {
    const a = makePhrase([60, 62, 64], [1, 1, 1]);
    const b = makePhrase([72, 64, 68], [1, 1, 1]);
    const c = makePhrase([55, 62, 50], [1, 1, 1]);
    const labels = detectSections([a, b, c]);
    expect(labels).toEqual(['Verse 1', 'Verse 1', 'Verse 1']);
  });
});
