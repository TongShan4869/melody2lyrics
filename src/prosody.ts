import type { AnalyzedNote, Note, Phrase } from './types';

const GAP_SECONDS_FLOOR = 0.4;
const MIN_AUTO_LINE_SYLLABLES = 6;
const PREFERRED_AUTO_LINE_SYLLABLES = 12;
const MAX_AUTO_LINE_SYLLABLES = 20;
const STRONG_STRESS_THRESHOLD = 0.8;

export function estimateBeat(notes: Note[]): number {
  const iois = notes
    .slice(1)
    .map((note, index) => note.time - notes[index].time)
    .filter((gap) => gap >= 0.1 && gap <= 2.0);

  if (iois.length === 0) return 1;

  const buckets = new Map<number, number>();
  for (const ioi of iois) {
    const bucket = Math.round(ioi / 0.05) * 0.05;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  const mode = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return Math.max(0.2, mode * 2);
}

export function segmentNotes(notes: Note[]): Note[][] {
  if (notes.length === 0) return [];
  if (notes.length === 1) return [notes];

  const gaps = notes.slice(1).map((note, index) => note.time - (notes[index].time + notes[index].duration));
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor((sortedGaps.length - 1) / 2)] ?? 0;
  const threshold = Math.max(GAP_SECONDS_FLOOR, 2 * medianGap);

  const phrases: Note[][] = [[notes[0]]];
  for (let index = 1; index < notes.length; index += 1) {
    const gap = notes[index].time - (notes[index - 1].time + notes[index - 1].duration);
    if (gap >= threshold) phrases.push([]);
    phrases[phrases.length - 1].push(notes[index]);
  }

  return phrases.flatMap(splitOversizedPhrase);
}

export function analyzeNotes(notes: Note[]): Phrase[] {
  const orderedNotes = [...notes].sort((a, b) => a.time - b.time);
  return analyzePhraseGroups(segmentNotes(orderedNotes), orderedNotes);
}

function analyzePhraseGroups(noteGroups: Note[][], allNotes = noteGroups.flat()): Phrase[] {
  const orderedNotes = [...allNotes].sort((a, b) => a.time - b.time);
  const beat = estimateBeat(orderedNotes);

  return noteGroups.filter((phraseNotes) => phraseNotes.length > 0).map((phraseNotes, phraseIndex) => {
    const orderedPhraseNotes = [...phraseNotes].sort((a, b) => a.time - b.time);
    const analyzedNotes = analyzePhraseNotes(orderedPhraseNotes, beat);
    return buildPhrase(analyzedNotes, phraseIndex);
  });
}

function buildPhrase(analyzedNotes: AnalyzedNote[], phraseIndex: number): Phrase {
  const stressPattern = analyzedNotes.map((note) => note.stress).join('-');
  const first = analyzedNotes[0];
  const last = analyzedNotes[analyzedNotes.length - 1];
  const penultimate = analyzedNotes[analyzedNotes.length - 2];

  return {
    id: `phrase-${phraseIndex}`,
    notes: analyzedNotes,
    syllables: analyzedNotes.length,
    stressPattern,
    endingDirection: endingDirection(penultimate?.midi, last?.midi),
    startTime: first?.time ?? 0,
    endTime: last ? last.time + last.duration : 0,
  };
}

function analyzePhraseNotes(notes: Note[], beat: number): AnalyzedNote[] {
  if (notes.length === 0) return [];

  const phraseStart = notes[0];
  const analyzed = notes.map((note): AnalyzedNote => {
    const stressScore = metricStress(note, phraseStart, beat);
    return {
      ...note,
      stressScore,
      stress: stressScore >= STRONG_STRESS_THRESHOLD ? 'S' : 'w',
    };
  });

  if (analyzed.some((note) => note.stress === 'S')) return analyzed;

  const anchor = analyzed.reduce((best, note) => (note.stressScore > best.stressScore ? note : best), analyzed[0]);
  return analyzed.map((note): AnalyzedNote => ({
    ...note,
    stress: note === anchor ? 'S' : 'w',
  }));
}

function metricStress(note: Note, phraseStart: Note, estimatedBeat: number): number {
  if (note.ticks != null && note.ppq != null && note.ppq > 0) {
    const [numerator, denominator] = note.timeSignature ?? [4, 4];
    const ticksPerBeat = note.ppq * (4 / denominator);
    const ticksPerBar = ticksPerBeat * numerator;
    const tickInBeat = positiveModulo(note.ticks, ticksPerBeat);
    const distanceToBeat = Math.min(tickInBeat, ticksPerBeat - tickInBeat) / ticksPerBeat;
    const beatCloseness = Math.max(0, 1 - distanceToBeat * 2);
    const beatInBar = Math.floor(positiveModulo(note.ticks, ticksPerBar) / ticksPerBeat);
    const beatWeight = metricBeatWeight(beatInBar, numerator);

    return beatCloseness * beatWeight;
  }

  const [numerator] = note.timeSignature ?? phraseStart.timeSignature ?? [4, 4];
  const beatPosition = (note.time - phraseStart.time) / estimatedBeat;
  const distanceToBeat = Math.abs(beatPosition - Math.round(beatPosition));
  const beatCloseness = Math.max(0, 1 - distanceToBeat * 2);
  const beatInCycle = positiveModulo(Math.round(beatPosition), numerator);

  return beatCloseness * metricBeatWeight(beatInCycle, numerator);
}

function metricBeatWeight(beatInBar: number, numerator: number): number {
  if (beatInBar === 0) return 1;
  if (numerator === 4 && beatInBar === 2) return 0.85;
  if (numerator === 6 && beatInBar === 3) return 0.85;
  if (numerator >= 8 && beatInBar === Math.floor(numerator / 2)) return 0.85;
  return 0.45;
}

function splitOversizedPhrase(notes: Note[]): Note[][] {
  if (notes.length <= MAX_AUTO_LINE_SYLLABLES) return [notes];

  const phrases: Note[][] = [];
  let phraseStartIndex = 0;
  const estimatedBeat = estimateBeat(notes);

  for (let index = 1; index < notes.length; index += 1) {
    const currentLength = index - phraseStartIndex;
    if (currentLength < MIN_AUTO_LINE_SYLLABLES) continue;

    const shouldSplitAtMusicalBoundary =
      currentLength >= PREFERRED_AUTO_LINE_SYLLABLES && isStrongLineStart(notes[index], notes[phraseStartIndex], estimatedBeat);
    const shouldForceSplit = currentLength >= MAX_AUTO_LINE_SYLLABLES;

    if (shouldSplitAtMusicalBoundary || shouldForceSplit) {
      phrases.push(notes.slice(phraseStartIndex, index));
      phraseStartIndex = index;
    }
  }

  const finalPhrase = notes.slice(phraseStartIndex);
  if (finalPhrase.length < MIN_AUTO_LINE_SYLLABLES && phrases.length > 0) {
    phrases[phrases.length - 1] = [...phrases[phrases.length - 1], ...finalPhrase];
  } else {
    phrases.push(finalPhrase);
  }

  return phrases;
}

function isStrongLineStart(note: Note, phraseStart: Note, estimatedBeat: number): boolean {
  if (note.ticks != null && note.ppq != null && note.ppq > 0) {
    const [numerator, denominator] = note.timeSignature ?? [4, 4];
    const ticksPerBeat = note.ppq * (4 / denominator);
    const ticksPerBar = ticksPerBeat * numerator;
    const tickInBar = positiveModulo(note.ticks, ticksPerBar);
    const beatInBar = Math.round(tickInBar / ticksPerBeat);
    const aligned = Math.abs(tickInBar - beatInBar * ticksPerBeat) < ticksPerBeat * 0.1;
    return aligned && beatInBar === 0;
  }
  return metricStress(note, phraseStart, estimatedBeat) >= STRONG_STRESS_THRESHOLD;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function endingDirection(previous?: number, current?: number): Phrase['endingDirection'] {
  if (previous == null || current == null) return 'level';
  if (current > previous) return 'rising';
  if (current < previous) return 'falling';
  return 'level';
}

export function mergePhrases(phrases: Phrase[], index: number): Phrase[] {
  if (index < 0 || index >= phrases.length - 1) return phrases;
  const noteGroups = phrases.flatMap((phrase, phraseIndex) => {
    if (phraseIndex === index) return [[...phrase.notes, ...phrases[index + 1].notes]];
    if (phraseIndex === index + 1) return [];
    return [phrase.notes];
  });
  return analyzePhraseGroups(noteGroups, phrases.flatMap((phrase) => phrase.notes));
}

export function splitPhrase(phrases: Phrase[], phraseIndex: number, atNoteIndex: number): Phrase[] {
  const phrase = phrases[phraseIndex];
  if (!phrase || atNoteIndex <= 0 || atNoteIndex >= phrase.notes.length) return phrases;

  const rebuilt = phrases.flatMap((existing, index) => {
    if (index !== phraseIndex) return [existing.notes];
    return [phrase.notes.slice(0, atNoteIndex), phrase.notes.slice(atNoteIndex)];
  });

  return analyzePhraseGroups(rebuilt, phrases.flatMap((existing) => existing.notes));
}
