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
  const envelopes: GainNode[] = [];

  master.gain.value = 0.18;
  master.connect(audioContext.destination);

  for (const note of notes) {
    if (note.time + note.duration <= offsetSeconds) continue;

    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const start = startAt + Math.max(0, note.time - offsetSeconds);
    const remaining = (note.time + note.duration) - Math.max(note.time, offsetSeconds);
    const end = start + Math.max(0.06, remaining);
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
    envelopes.push(envelope);
  }

  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      const now = audioContext.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0.0001, now + 0.02);
      } catch {
        // ignore
      }
      for (const env of envelopes) {
        try {
          env.gain.cancelScheduledValues(now);
          env.gain.setValueAtTime(0.0001, now);
        } catch {
          // ignore
        }
      }
      for (const osc of oscillators) {
        try {
          osc.stop(now + 0.03);
        } catch {
          // ignore
        }
      }
      setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          // ignore
        }
      }, 50);
    },
  };
}

export function melodyDuration(notes: Note[]): number {
  return notes.reduce((max, note) => Math.max(max, note.time + note.duration), 0);
}
