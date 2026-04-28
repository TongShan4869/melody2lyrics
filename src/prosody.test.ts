import { describe, expect, it } from 'vitest';
import { analyzeNotes, mergePhrases, splitPhrase } from './prosody';
import type { Note } from './types';

function note(id: number, time: number, duration = 0.25, midi = 60, options: Partial<Note> = {}): Note {
  return { id: String(id), time, duration, midi, pitch: 'C4', velocity: 0.8, ...options };
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

  it('splits long continuous rap runs into singable lyric lines', () => {
    const notes = Array.from({ length: 48 }, (_, index) =>
      note(index + 1, index * 0.125, 0.1, 60, {
        ticks: index * 120,
        durationTicks: 96,
        ppq: 480,
        timeSignature: [4, 4],
      }),
    );
    const phrases = analyzeNotes(notes);

    expect(phrases).toHaveLength(3);
    expect(phrases.map((phrase) => phrase.syllables)).toEqual([16, 16, 16]);
  });

  it('extends dense lines so the next line can start on a strong beat', () => {
    const notes = Array.from({ length: 40 }, (_, index) =>
      note(index + 1, index * 0.125, 0.1, 60, {
        ticks: index * 120,
        durationTicks: 96,
        ppq: 480,
        timeSignature: [5, 4],
      }),
    );
    const phrases = analyzeNotes(notes);

    expect(phrases.map((phrase) => phrase.syllables)).toEqual([20, 20]);
    expect(phrases.every((phrase) => phrase.stressPattern.startsWith('S'))).toBe(true);
  });

  it('force-splits oversized phrases even without MIDI tick metadata', () => {
    const notes = Array.from({ length: 35 }, (_, index) => note(index + 1, index * 0.1, 0.08));
    const phrases = analyzeNotes(notes);

    expect(phrases.length).toBeGreaterThan(1);
    expect(Math.max(...phrases.map((phrase) => phrase.syllables))).toBeLessThanOrEqual(20);
  });

  it('marks metric strong beats from MIDI ticks and time signature', () => {
    const notes = [0, 480, 960, 1440].map((ticks, index) =>
      note(index + 1, index * 0.5, 0.25, 60, {
        ticks,
        durationTicks: 240,
        ppq: 480,
        timeSignature: [4, 4],
      }),
    );
    const phrases = analyzeNotes(notes);

    expect(phrases[0].stressPattern).toBe('S-w-S-w');
  });

  it('does not let velocity override metric position', () => {
    const phrases = analyzeNotes([
      note(1, 0, 0.1, 60, { ticks: 0, ppq: 480, timeSignature: [4, 4], velocity: 0.1 }),
      note(2, 0.25, 0.1, 60, { ticks: 240, ppq: 480, timeSignature: [4, 4], velocity: 1 }),
      note(3, 0.5, 0.1, 60, { ticks: 480, ppq: 480, timeSignature: [4, 4], velocity: 1 }),
    ]);

    expect(phrases[0].stressPattern).toBe('S-w-w');
  });

  it('keeps every lyric line anchored when no note lands on a strong beat', () => {
    const phrases = analyzeNotes([
      note(1, 0, 0.1, 60, { ticks: 240, ppq: 480, timeSignature: [4, 4] }),
      note(2, 0.5, 0.1, 60, { ticks: 720, ppq: 480, timeSignature: [4, 4] }),
      note(3, 1, 0.1, 60, { ticks: 1200, ppq: 480, timeSignature: [4, 4] }),
    ]);

    expect(phrases[0].stressPattern).toBe('S-w-w');
  });

  it('splits at the clicked note so it starts the next phrase', () => {
    const phrases = analyzeNotes([note(1, 0), note(2, 0.25), note(3, 0.5), note(4, 0.75)]);
    const split = splitPhrase(phrases, 0, 2);

    expect(split).toHaveLength(2);
    expect(split[0].notes.map((item) => item.id)).toEqual(['1', '2']);
    expect(split[1].notes.map((item) => item.id)).toEqual(['3', '4']);
  });

  it('does not split at the first note', () => {
    const phrases = analyzeNotes([note(1, 0), note(2, 0.25), note(3, 0.5)]);
    expect(splitPhrase(phrases, 0, 0)).toBe(phrases);
  });

  it('keeps manually merged phrases together even across long gaps', () => {
    const phrases = analyzeNotes([note(1, 0), note(2, 0.5), note(3, 2)]);
    const merged = mergePhrases(phrases, 0);

    expect(phrases).toHaveLength(2);
    expect(merged).toHaveLength(1);
    expect(merged[0].notes.map((item) => item.id)).toEqual(['1', '2', '3']);
  });
});
