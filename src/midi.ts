import { Midi } from '@tonejs/midi';
import type { ParsedMidi } from './types';

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
