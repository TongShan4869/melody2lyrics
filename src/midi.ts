import { Midi } from '@tonejs/midi';
import type { Note, ParsedMidi } from './types';

export async function parseMidiFile(file: File): Promise<ParsedMidi> {
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);
  const track = [...midi.tracks].sort((a, b) => b.notes.length - a.notes.length)[0];

  if (!track || track.notes.length === 0) {
    throw new Error('No pitched notes were found in this MIDI file.');
  }

  const header = midi.header;
  const timeSignature = normalizeTimeSignature(header.timeSignatures[0]?.timeSignature);
  const tempos = header.tempos.map((tempo) => Math.round(tempo.bpm));

  return {
    notes: track.notes.map((note, index) => ({
      id: `note-${index}`,
      midi: note.midi,
      pitch: note.name,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity,
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      ppq: header.ppq,
      timeSignature,
    })),
    info: {
      tempos: tempos.length ? tempos : [120],
      timeSignature,
      ppq: header.ppq,
      trackName: track.name || 'Track with most notes',
    },
  };
}

function normalizeTimeSignature(value?: number[]): [number, number] {
  const numerator = value?.[0] && value[0] > 0 ? value[0] : 4;
  const denominator = value?.[1] && value[1] > 0 ? value[1] : 4;
  return [numerator, denominator];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export type SampleMelody = ParsedMidi & { fileName: string };

// Build a sample MIDI on the fly for the "Try a sample" CTA.
export function buildSampleMelody(): SampleMelody {
  const ppq = 480;
  const tempo = 96;
  const beat = 60 / tempo;
  const ts: [number, number] = [4, 4];
  const sequence: Array<[number, number, number]> = [
    [67, 0.5, 0], [69, 0.5, 0], [71, 0.5, 0], [72, 1.0, 0],
    [71, 0.5, 0], [69, 0.5, 0], [67, 0.5, 0], [65, 1.0, 1.0],
    [64, 0.5, 0], [67, 0.5, 0], [69, 1.0, 0], [67, 0.5, 0],
    [65, 0.5, 0], [64, 0.5, 0], [62, 0.5, 0], [60, 1.5, 0],
  ];
  let t = 0;
  const notes: Note[] = sequence.map(([midi, dur, gap], index) => {
    const time = t;
    const ticks = Math.round((time / beat) * ppq);
    const durationTicks = Math.round(dur * ppq);
    t += (dur + gap) * beat;
    return {
      id: `sample-${index}`,
      midi,
      pitch: midiName(midi),
      time,
      duration: dur * beat,
      velocity: 0.78,
      ticks,
      durationTicks,
      ppq,
      timeSignature: ts,
    };
  });
  return {
    notes,
    info: { tempos: [tempo], timeSignature: ts, ppq, trackName: 'Sample melody' },
    fileName: 'sample-melody.mid',
  };
}
