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
