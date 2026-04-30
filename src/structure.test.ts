import { describe, expect, it } from 'vitest';
import { phraseSimilarity } from './structure';
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
