import type { AnalyzedNote, Note, Phrase } from './types';

const GAP_SECONDS_FLOOR = 0.4;

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

  return phrases;
}

export function analyzeNotes(notes: Note[]): Phrase[] {
  const orderedNotes = [...notes].sort((a, b) => a.time - b.time);
  const beat = estimateBeat(orderedNotes);
  const phrases = segmentNotes(orderedNotes);

  return phrases.map((phraseNotes, phraseIndex) => {
    const analyzedNotes = analyzePhraseNotes(phraseNotes, beat);
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
  });
}

function analyzePhraseNotes(notes: Note[], beat: number): AnalyzedNote[] {
  if (notes.length === 0) return [];

  const maxDuration = Math.max(...notes.map((note) => note.duration), 0.001);
  const minPitch = Math.min(...notes.map((note) => note.midi));
  const maxPitch = Math.max(...notes.map((note) => note.midi));
  const pitchRange = Math.max(1, maxPitch - minPitch);

  const phraseStart = notes[0].time;
  const scored = notes.map((note, index) => {
    const metric = index === 0 ? 1 : metricStress(note, phraseStart, beat);
    const duration = note.duration / maxDuration;
    const pitch = (note.midi - minPitch) / pitchRange;
    const velocity = note.velocity || 0.75;
    const stressScore = 0.45 * metric + 0.25 * duration + 0.2 * pitch + 0.1 * velocity;
    return { ...note, stressScore };
  });

  const stressCount = Math.max(1, Math.ceil(scored.length * 0.4));
  const threshold = [...scored].sort((a, b) => b.stressScore - a.stressScore)[stressCount - 1]?.stressScore ?? 1;

  return scored.map((note) => ({
    ...note,
    stress: note === scored[0] || note.stressScore >= threshold ? 'S' : 'w',
  }));
}

function metricStress(note: Note, phraseStart: number, estimatedBeat: number): number {
  if (note.ticks != null && note.ppq != null && note.ppq > 0) {
    const [numerator, denominator] = note.timeSignature ?? [4, 4];
    const ticksPerBeat = note.ppq * (4 / denominator);
    const ticksPerBar = ticksPerBeat * numerator;
    const tickInBeat = positiveModulo(note.ticks, ticksPerBeat);
    const distanceToBeat = Math.min(tickInBeat, ticksPerBeat - tickInBeat) / ticksPerBeat;
    const beatCloseness = Math.max(0, 1 - distanceToBeat * 2);
    const beatInBar = Math.floor(positiveModulo(note.ticks, ticksPerBar) / ticksPerBeat);
    const beatWeight = beatInBar === 0 ? 1 : 0.82;

    return beatCloseness * beatWeight;
  }

  const beatPosition = (note.time - phraseStart) / estimatedBeat;
  const distanceToBeat = Math.abs(beatPosition - Math.round(beatPosition));
  return Math.max(0, 1 - distanceToBeat * 2);
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
  const notes = phrases.flatMap((phrase, phraseIndex) => {
    if (phraseIndex === index) return [...phrase.notes, ...phrases[index + 1].notes];
    if (phraseIndex === index + 1) return [];
    return phrase.notes;
  });
  return analyzeNotes(notes);
}

export function splitPhrase(phrases: Phrase[], phraseIndex: number, afterNoteIndex: number): Phrase[] {
  const phrase = phrases[phraseIndex];
  if (!phrase || afterNoteIndex < 0 || afterNoteIndex >= phrase.notes.length - 1) return phrases;

  const rebuilt = phrases.flatMap((existing, index) => {
    if (index !== phraseIndex) return [existing.notes];
    return [phrase.notes.slice(0, afterNoteIndex + 1), phrase.notes.slice(afterNoteIndex + 1)];
  });

  return rebuilt.map((notes, index) => {
    const analyzed = analyzeNotes(notes)[0];
    return { ...analyzed, id: `phrase-${index}` };
  });
}
