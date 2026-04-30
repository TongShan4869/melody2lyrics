import type { Phrase } from './types';

function resample(values: number[], length: number): number[] {
  if (values.length === 0) return new Array(length).fill(0);
  if (values.length === length) return values;
  const out = new Array<number>(length);
  for (let i = 0; i < length; i += 1) {
    const t = (i / Math.max(1, length - 1)) * (values.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(values.length - 1, lo + 1);
    const frac = t - lo;
    out[i] = values[lo] * (1 - frac) + values[hi] * frac;
  }
  return out;
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom === 0 ? 1 : num / denom;
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] || 1;
}

export function phraseSimilarity(a: Phrase, b: Phrase): number {
  if (a.notes.length === 0 || b.notes.length === 0) return 0;
  const length = Math.max(a.notes.length, b.notes.length);
  const aPitch = resample(a.notes.map((n) => n.midi), length);
  const bPitch = resample(b.notes.map((n) => n.midi), length);
  const pitchScore = (correlation(aPitch, bPitch) + 1) / 2;

  const aMedian = median(a.notes.map((n) => n.duration));
  const bMedian = median(b.notes.map((n) => n.duration));
  const aRhythm = resample(a.notes.map((n) => n.duration / aMedian), length);
  const bRhythm = resample(b.notes.map((n) => n.duration / bMedian), length);
  const rhythmScore = (correlation(aRhythm, bRhythm) + 1) / 2;

  const lengthScore = a.syllables === b.syllables ? 1 : 0.5;

  return 0.55 * pitchScore + 0.3 * rhythmScore + 0.15 * lengthScore;
}

const SIMILARITY_THRESHOLD = 0.85;

export function detectSections(phrases: Phrase[]): string[] {
  if (phrases.length === 0) return [];

  const clusterId = new Array(phrases.length).fill(-1);
  let nextCluster = 0;
  for (let i = 0; i < phrases.length; i += 1) {
    if (clusterId[i] !== -1) continue;
    clusterId[i] = nextCluster;
    for (let j = i + 1; j < phrases.length; j += 1) {
      if (clusterId[j] !== -1) continue;
      if (phraseSimilarity(phrases[i], phrases[j]) >= SIMILARITY_THRESHOLD) {
        clusterId[j] = nextCluster;
      }
    }
    nextCluster += 1;
  }

  const clusterSize = new Array(nextCluster).fill(0);
  for (const id of clusterId) clusterSize[id] += 1;

  // Largest recurring cluster (size >= 2) becomes Chorus.
  let chorusCluster = -1;
  let chorusSize = 1;
  for (let id = 0; id < nextCluster; id += 1) {
    if (clusterSize[id] >= 2 && clusterSize[id] > chorusSize) {
      chorusCluster = id;
      chorusSize = clusterSize[id];
    }
  }

  const baseName = (id: number): string =>
    id === chorusCluster ? 'Chorus' : 'Verse';

  // Run-based numbering: counter increments each time the baseName changes.
  const counters = new Map<string, number>();
  let lastName = '';
  return clusterId.map((id) => {
    const name = baseName(id);
    if (name !== lastName) {
      counters.set(name, (counters.get(name) ?? 0) + 1);
      lastName = name;
    }
    return `${name} ${counters.get(name)}`;
  });
}
