import { describe, expect, it } from 'vitest';
import { buildPrompt, rhymeLabels, rhythmProfile, sectionRhymeLabels, sectionRhymePlan } from './prompt';
import type { LyricsContext, Phrase, PhraseLockState } from './types';

const context: LyricsContext = {
  theme: 'Science in Motion',
  mood: 'upbeat',
  genre: 'kpop dance',
  pov: 'we/us',
  otherNotes: '',
  mustInclude: '',
  avoid: '',
  rhymeScheme: 'AX',
  strictSyllables: true,
};

const phrase: Phrase = {
  id: 'phrase-1',
  notes: [
    { id: 'n1', midi: 60, pitch: 'C4', time: 0, duration: 0.2, velocity: 0.8, stressScore: 1, stress: 'S' },
    { id: 'n2', midi: 62, pitch: 'D4', time: 0.2, duration: 0.2, velocity: 0.8, stressScore: 0.4, stress: 'w' },
    { id: 'n3', midi: 64, pitch: 'E4', time: 0.4, duration: 0.5, velocity: 0.8, stressScore: 0.4, stress: 'w' },
  ],
  syllables: 10,
  stressPattern: 'S-w-w-w-w-S-w-w-S-w',
  endingDirection: 'falling',
  startTime: 0,
  endTime: 1,
};

const lock: PhraseLockState = {
  phraseIndex: 0,
  rawInput: '',
  tokens: [],
  totalSyllables: 0,
  policy: 'strict',
  lockedAfterGeneration: false,
};

describe('prompt builder', () => {
  it('describes note duration as a compact rhythm profile', () => {
    expect(rhythmProfile(phrase)).toBe('short-short-held');
  });

  it('treats X rhyme labels as free lines', () => {
    expect(rhymeLabels('AX', 4)).toEqual(['A', '', 'A', '']);
  });

  it('restarts rhyme labels for each section', () => {
    expect(sectionRhymeLabels('ABAB', ['Verse 1', 'Verse 1', 'Chorus 1', 'Chorus 1', 'Chorus 1'])).toEqual(['A', 'B', 'A', 'B', 'A']);
  });

  it('supports one rhyme family per section', () => {
    expect(rhymeLabels('SECTION', 3)).toEqual(['', '', '']);
    expect(sectionRhymeLabels('SECTION', ['Verse 1', 'Chorus 1'])).toEqual(['', '']);
    expect(sectionRhymePlan(['Rap verse 1', 'Rap verse 1', 'Chorus 1'])).toContain('one rhyme family per section');
  });

  it('includes lyric quality guardrails against repeated filler endings', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);

    expect(prompt).toContain('LYRIC QUALITY CHECK');
    expect(prompt).toContain('rhythm = short-short-held');
    expect(prompt).toContain('Fit note duration');
    expect(prompt).toContain('Rhyme approach: Choose one rhyme family per section');
    expect(prompt).toContain('Keep one coherent rhyme family per section');
    expect(prompt).toContain('Do not repeat a full lyric line');
    expect(prompt).toContain('Avoid reusing the same final word');
    expect(prompt).toContain('Prefer near rhymes and internal rhymes');
    expect(prompt).toContain('light, night, tonight, fire, higher');
  });

  it('puts other notes at the end of the prompt', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, otherNotes: 'Make the hook brighter.' }, ['Chorus']);

    expect(prompt.trim().endsWith('OTHER NOTES\nMake the hook brighter.')).toBe(true);
  });
});
