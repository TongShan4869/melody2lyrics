import type { Note } from './types';

export type PlaybackHandle = {
  stop: () => void;
};

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function schedulePreview(notes: Note[], audioContext: AudioContext, offsetSeconds = 0): PlaybackHandle {
  const startAt = audioContext.currentTime + 0.06;
  const master = audioContext.createGain();
  const oscillators: OscillatorNode[] = [];

  master.gain.value = 0.18;
  master.connect(audioContext.destination);

  for (const note of notes) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const start = startAt + Math.max(0, note.time - offsetSeconds);
    const end = start + Math.max(0.06, note.duration);
    const velocity = Math.max(0.18, note.velocity || 0.75);

    oscillator.type = 'triangle';
    oscillator.frequency.value = midiToFrequency(note.midi);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(velocity, start + 0.015);
    envelope.gain.setValueAtTime(velocity, Math.max(start + 0.016, end - 0.035));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    oscillators.push(oscillator);
  }

  return {
    stop: () => {
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Already stopped by the scheduled end time.
        }
      }
      master.disconnect();
    },
  };
}

export function melodyDuration(notes: Note[]): number {
  return notes.reduce((max, note) => Math.max(max, note.time + note.duration), 0);
}
