import { describe, expect, it } from 'vitest';
import { buildPrompt, buildRevisionPrompt, clusterTags, compoundProsody, rhymeLabels, rhythmProfile, sectionRhymeLabels, sectionRhymePlan } from './prompt';
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
    { id: 'n1', midi: 60, pitch: 'C4', time: 0, duration: 0.2, velocity: 0.8, stressScore: 1, stress: 'S', length: 'S' },
    { id: 'n2', midi: 62, pitch: 'D4', time: 0.2, duration: 0.2, velocity: 0.8, stressScore: 0.4, stress: 'w', length: 'S' },
    { id: 'n3', midi: 64, pitch: 'E4', time: 0.4, duration: 0.5, velocity: 0.8, stressScore: 0.4, stress: 'w', length: 'L' },
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

  it('emits compound prosody tokens per note', () => {
    expect(compoundProsody(phrase)).toBe('<strong,short>-<weak,short>-<weak,long>');
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
    expect(sectionRhymePlan(['Rap verse 1', 'Rap verse 1', 'Chorus 1'])).toContain('one explicit rhyme family per section');
  });

  it('includes lyric quality guardrails against repeated filler endings', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);

    expect(prompt).toContain('LYRIC QUALITY CHECK');
    expect(prompt).toContain('prosody = <strong,short>-<weak,short>-<weak,long>');
    expect(prompt).toContain('Fit note duration');
    expect(prompt).toContain('RHYME PLAN: Choose one explicit rhyme family per section');
    expect(prompt).toContain('silently choose a specific rhyme family before writing');
    expect(prompt).toContain('Do not repeat a full lyric line');
    expect(prompt).toContain('Avoid reusing the same final word');
    expect(prompt).toContain('Prefer near rhymes and internal rhymes');
    expect(prompt).toContain('light, night, tonight, fire, higher');
  });

  it('annotates clustered phrases with (repeat X) in the line header', () => {
    // Two identical phrases (same pitches, same durations) should cluster as A.
    const repeatedPhrase: Phrase = {
      ...phrase,
      id: 'phrase-2',
      notes: phrase.notes.map((n, i) => ({ ...n, id: `m${i}` })),
    };
    const lock2: PhraseLockState = { ...lock, phraseIndex: 1 };

    const prompt = buildPrompt([phrase, repeatedPhrase], [lock, lock2], { ...context, rhymeScheme: 'SECTION' }, ['Chorus', 'Chorus']);

    // Both lines carry (repeat A), no (repeat B).
    const repeatA = prompt.match(/\(repeat A\)/g) ?? [];
    expect(repeatA).toHaveLength(2);
    expect(prompt).not.toContain('(repeat B)');

    // The tag appears between the section label and the dash before "syllables".
    expect(prompt).toMatch(/Line 1 \[Chorus\] \(repeat A\) - \d+ syllables/);
    expect(prompt).toMatch(/Line 2 \[Chorus\] \(repeat A\) - \d+ syllables/);
  });

  it('omits the repeat tag for singleton clusters', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);
    expect(prompt).not.toContain('(repeat');
  });

  it('includes the chorus-repetition rule in the RULES block', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);
    expect(prompt).toContain('8. Lines sharing a `repeat');
    expect(prompt).toMatch(/share an identical melody/);
    // Old rule 9 ("Do not add explanations before or after the lyrics.") should now be rule 10.
    expect(prompt).toContain('10. Do not add explanations before or after the lyrics.');
  });

  it('includes the prosody principles block', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);

    expect(prompt).toContain('PROSODY PRINCIPLES (singability)');
    expect(prompt).toContain('Strength alignment');
    expect(prompt).toContain('Length alignment');
    expect(prompt).toContain('<strong/weak,long/short>');

    const block = prompt.split('PROSODY PRINCIPLES (singability)\n')[1].split('\n\nRHYME PLAN:')[0];
    expect(`PROSODY PRINCIPLES (singability)\n${block}`).toMatchInlineSnapshot(`
      "PROSODY PRINCIPLES (singability)
      1. Strength alignment: place stressed syllables on <strong> notes; unstressed on <weak>.
      2. Length alignment: place long syllables (open or held vowels — IPA [ː], or diphthongs like /eɪ/, /aɪ/, /aʊ/, /oʊ/, /ɔɪ/) on <long> notes; short, closed-vowel syllables on <short> notes.
      3. Singers can comfortably sustain long vowels and diphthongs; closed-vowel syllables on long notes feel strained.
      4. The compound template <strong/weak,long/short> per slot communicates both axes — honor it."
    `);
  });

  it('puts other notes at the end of the prompt', () => {
    const prompt = buildPrompt([phrase], [lock], { ...context, otherNotes: 'Make the hook brighter.' }, ['Chorus']);

    expect(prompt.trim().endsWith('OTHER NOTES\nMake the hook brighter.')).toBe(true);
  });
});

describe('clusterTags', () => {
  const makePhrase = (id: string, durations: number[], pitches: number[]): Phrase => ({
    id,
    notes: durations.map((d, i) => ({
      id: `${id}-n${i}`, midi: pitches[i] ?? 60, pitch: 'C4', time: i, duration: d, velocity: 0.8,
      stressScore: 0.5, stress: 'w', length: 'S',
    })),
    syllables: durations.length,
    stressPattern: '',
    endingDirection: 'level',
    startTime: 0,
    endTime: 0,
  });

  it('returns null for every phrase when nothing clusters', () => {
    const a = makePhrase('a', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b = makePhrase('b', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    expect(clusterTags([a, b])).toEqual([null, null]);
  });

  it('assigns A to a cluster of two', () => {
    const a = makePhrase('a', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b = makePhrase('b', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const c = makePhrase('c', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    expect(clusterTags([a, b, c])).toEqual(['A', 'A', null]);
  });

  it('assigns A and B to two distinct repeating clusters', () => {
    const a1 = makePhrase('a1', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b1 = makePhrase('b1', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    const a2 = makePhrase('a2', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b2 = makePhrase('b2', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    expect(clusterTags([a1, b1, a2, b2])).toEqual(['A', 'B', 'A', 'B']);
  });

  it('returns empty array for empty input', () => {
    expect(clusterTags([])).toEqual([]);
  });
});

const fixturePhrase = (id: string, syllables: number): Phrase => ({
  id, notes: [], syllables,
  stressPattern: 'w-S-w-S-w',
  endingDirection: 'level',
  startTime: 0, endTime: 0,
});

const fixtureContext: LyricsContext = {
  theme: '', mood: '', genre: '', pov: '', otherNotes: '',
  mustInclude: '', avoid: '', rhymeScheme: 'SECTION', strictSyllables: true,
};

describe('buildRevisionPrompt', () => {
  it('marks failing lines and instructs to keep others verbatim', () => {
    const prompt = buildRevisionPrompt({
      phrases: [fixturePhrase('p1', 5), fixturePhrase('p2', 5)],
      locks: [],
      sectionLabels: ['Verse 1', 'Verse 1'],
      context: fixtureContext,
      currentLines: ['line one ok', 'line two failing'],
      validations: [
        { index: 0, text: 'line one ok', passed: true, failures: [] },
        { index: 1, text: 'line two failing', passed: false, failures: [{ type: 'syllables', message: '6 syllables, target 5' }] },
      ],
      previousAttempts: new Map(),
    });
    expect(prompt).toContain('REWRITE ONLY');
    expect(prompt).toContain('Line 2');
    expect(prompt).toMatch(/keep[^\n]*verbatim/i);
  });

  it('includes prior attempts when provided', () => {
    const prior = new Map<number, string[]>([[1, ['previous bad attempt']]]);
    const prompt = buildRevisionPrompt({
      phrases: [fixturePhrase('p1', 5), fixturePhrase('p2', 5)],
      locks: [],
      sectionLabels: ['Verse 1', 'Verse 1'],
      context: fixtureContext,
      currentLines: ['line one', 'line two'],
      validations: [
        { index: 0, text: 'line one', passed: true, failures: [] },
        { index: 1, text: 'line two', passed: false, failures: [{ type: 'syllables', message: 'short' }] },
      ],
      previousAttempts: prior,
    });
    expect(prompt).toContain('previous bad attempt');
    expect(prompt).toMatch(/different direction/i);
  });
});
