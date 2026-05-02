import { Fragment, useEffect, useRef } from 'react';
import type { Note, Phrase } from '../types';

type Props = {
  phrases: Phrase[];
  notes: Note[];
  selectedPhraseId: string | null;
  onSelectPhrase: (id: string) => void;
  onSplit: (phraseIndex: number, noteIndex: number) => void;
  onSeek?: (time: number) => void;
  playheadTime: number;
  isPlaying: boolean;
};

export function PianoRoll({ phrases, notes, selectedPhraseId, onSelectPhrase, onSplit, onSeek, playheadTime, isPlaying }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  if (notes.length === 0) return null;

  const minMidi = Math.min(...notes.map((n) => n.midi));
  const maxMidi = Math.max(...notes.map((n) => n.midi));
  const range = Math.max(6, maxMidi - minMidi);
  const totalDuration = Math.max(...notes.map((n) => n.time + n.duration));
  const pxPerSec = 80;
  const width = Math.max(640, totalDuration * pxPerSec + 60);
  const height = 170;
  const noteHeight = 14;

  const noteToY = (m: number) => {
    const norm = (maxMidi - m) / range;
    return 12 + norm * (height - 24 - noteHeight);
  };

  // Auto-scroll to keep the playhead at ~35% from the left edge while playing.
  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const c = containerRef.current;
    const playheadX = playheadTime * pxPerSec + 10;
    const maxScroll = c.scrollWidth - c.clientWidth;
    const target = Math.max(0, Math.min(maxScroll, playheadX - c.clientWidth * 0.35));
    c.scrollLeft = target;
  }, [playheadTime, isPlaying]);

  useEffect(() => {
    if (!containerRef.current) return;
    const phrase = phrases.find((p) => p.id === selectedPhraseId);
    if (!phrase) return;
    const c = containerRef.current;
    const x1 = phrase.startTime * pxPerSec + 10;
    const x2 = phrase.endTime * pxPerSec + 10;
    if (x1 < c.scrollLeft || x2 > c.scrollLeft + c.clientWidth) {
      c.scrollTo({ left: Math.max(0, x1 - 40), behavior: 'smooth' });
    }
  }, [selectedPhraseId, phrases]);

  return (
    <div className="piano-roll" ref={containerRef}>
      <div className="roll-header">
        <span className="lbl">Phrases</span>
        <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11 }}>{phrases.length}</strong>
        <span className="lbl" style={{ marginLeft: 16 }}>Notes</span>
        <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11 }}>{notes.length}</strong>
        <span className="lbl" style={{ marginLeft: 16 }}>Duration</span>
        <strong style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 11 }}>{totalDuration.toFixed(1)}s</strong>
        <span style={{ flex: 1 }} />
        <span className="lbl" style={{ color: 'var(--accent)', fontFamily: 'var(--body)', textTransform: 'none', fontStyle: 'italic' }}>
          ✂ Hover any note and click to split a phrase
        </span>
      </div>

      <div
        className="roll-canvas"
        style={{ width, height, position: 'relative', cursor: onSeek ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (!onSeek) return;
          const target = e.target as HTMLElement;
          if (target.closest('.roll-note, .roll-phrase-label')) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - 10;
          const t = Math.max(0, Math.min(totalDuration, x / pxPerSec));
          onSeek(t);
        }}
      >
        {phrases.map((phrase) => {
          const isSelected = phrase.id === selectedPhraseId;
          const x1 = phrase.startTime * pxPerSec + 10;
          const x2 = phrase.endTime * pxPerSec + 10;
          return (
            <div
              key={`bg-${phrase.id}`}
              style={{
                position: 'absolute',
                left: x1,
                top: 0,
                width: Math.max(0, x2 - x1),
                height: '100%',
                background: isSelected ? 'color-mix(in oklab, var(--accent) 9%, transparent)' : 'transparent',
                borderLeft: '1px dashed var(--border)',
                borderRight: '1px dashed var(--border)',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {phrases.map((phrase, pIdx) =>
          phrase.notes.map((note, nIdx) => {
            const noteIsPlaying = playheadTime >= note.time && playheadTime <= note.time + note.duration;
            return (
              <div
                key={note.id}
                className={`roll-note ${note.stress === 'S' ? 'strong' : 'weak'} ${noteIsPlaying ? 'active' : ''} ${nIdx === 0 ? 'first-of-phrase' : ''}`}
                style={{
                  left: note.time * pxPerSec + 10,
                  top: noteToY(note.midi),
                  width: Math.max(8, note.duration * pxPerSec - 2),
                  height: noteHeight,
                }}
                title={`${note.pitch} · ${note.stress === 'S' ? 'strong' : 'weak'} · click to split phrase here`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (nIdx > 0) onSplit(pIdx, nIdx);
                  else onSelectPhrase(phrase.id);
                }}
              >
                <span>{note.stress}</span>
              </div>
            );
          }),
        )}

        {phrases.map((phrase, pIdx) => {
          const x1 = phrase.startTime * pxPerSec + 10;
          const x2 = phrase.endTime * pxPerSec + 10;
          return (
            <Fragment key={`br-${phrase.id}`}>
              <div className="roll-phrase-bracket" style={{ left: x1, width: Math.max(8, x2 - x1) }} />
              <div
                className={`roll-phrase-label ${phrase.id === selectedPhraseId ? 'selected' : ''}`}
                style={{ left: x1 }}
                onClick={() => onSelectPhrase(phrase.id)}
              >
                Line {pIdx + 1} · {phrase.syllables} syl
              </div>
            </Fragment>
          );
        })}

        {(isPlaying || playheadTime > 0) && (
          <div
            className={`roll-playhead ${isPlaying ? '' : 'paused'}`}
            style={{ left: playheadTime * pxPerSec + 10 }}
          />
        )}
      </div>

      <div className="roll-legend">
        <span><span className="swatch" style={{ background: 'var(--strong)' }} />Strong (S)</span>
        <span><span className="swatch" style={{ background: 'var(--weak)' }} />Weak (w)</span>
        <span><span className="swatch" style={{ background: 'var(--accent)', height: 1 }} />Phrase boundary</span>
      </div>
    </div>
  );
}
