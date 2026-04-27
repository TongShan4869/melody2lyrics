import { describe, expect, it } from 'vitest';
import { analyzeNotes } from './prosody';
import type { Note } from './types';

function note(id: number, time: number, duration = 0.25, midi = 60): Note {
  return { id: String(id), time, duration, midi, pitch: 'C4', velocity: 0.8 };
}

describe('prosody analysis', () => {
  it('handles empty input', () => {
    expect(analyzeNotes([])).toEqual([]);
  });

  it('returns one phrase for a single note', () => {
    const phrases = analyzeNotes([note(1, 0)]);
    expect(phrases).toHaveLength(1);
    expect(phrases[0].syllables).toBe(1);
  });

  it('splits phrases on long gaps', () => {
    const phrases = analyzeNotes([note(1, 0), note(2, 0.5), note(3, 2)]);
    expect(phrases).toHaveLength(2);
  });

  it('marks at least one strong stress per phrase', () => {
    const phrases = analyzeNotes([note(1, 0), note(2, 0.5), note(3, 1)]);
    expect(phrases[0].stressPattern).toContain('S');
  });

  it('treats the first note of each phrase as strong', () => {
    const phrases = analyzeNotes([
      note(1, 0, 0.1, 60),
      note(2, 0.25, 1, 72),
      note(3, 0.5, 1, 72),
    ]);

    expect(phrases[0].stressPattern.startsWith('S')).toBe(true);
  });
});
