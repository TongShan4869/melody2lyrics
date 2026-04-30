import { Flag, Pause, Play, Split, Scissors } from 'lucide-react';
import type { Phrase, PhraseLockState, LockPolicy, PhraseOrigin } from '../types';
import { LockInput } from './LockInput';

type Props = {
  phrase: Phrase;
  index: number;
  origin: PhraseOrigin;
  lock: PhraseLockState;
  onLockInputChange: (index: number, value: string) => void;
  onPolicyChange: (index: number, policy: LockPolicy) => void;
  onClear: (index: number) => void;
  onSplit: (phraseIndex: number, noteIndex: number) => void;
  onMerge: (phraseIndex: number) => void;
  onAddSectionMarker: (phraseIndex: number) => void;
  canMerge: boolean;
  canAddSectionMarker: boolean;
  activeNoteIds: Set<string>;
  isPlaying: boolean;
  onPlayPhrase: (phrase: Phrase) => void;
};

export function PhraseRow({
  phrase,
  index,
  origin,
  lock,
  onLockInputChange,
  onPolicyChange,
  onClear,
  onSplit,
  onMerge,
  onAddSectionMarker,
  canMerge,
  canAddSectionMarker,
  activeNoteIds,
  isPlaying,
  onPlayPhrase,
}: Props) {
  const maxDuration = Math.max(...phrase.notes.map((note) => note.duration), 0.001);

  return (
    <article className="phrase-row">
      <div className="phrase-meta">
        <div>
          <span className="eyebrow">Line {index + 1}</span>
          <span className={`origin-chip ${origin}`}>{origin}</span>
          <h3>{phrase.syllables} syllables</h3>
        </div>
        <div className="mono">{phrase.stressPattern}</div>
        <div className="ending">{phrase.endingDirection}</div>
      </div>

      <div className="note-strip" aria-label={`Phrase ${index + 1} notes`}>
        {phrase.notes.map((note, noteIndex) => (
          <button
            key={note.id}
            type="button"
            className={`note-bar ${note.stress === 'S' ? 'strong' : 'weak'} ${activeNoteIds.has(note.id) ? 'active' : ''}`}
            style={{ height: `${34 + (note.duration / maxDuration) * 52}px` }}
            title={`${note.pitch} ${note.stress}; click to split at this note`}
            onClick={() => onSplit(index, noteIndex)}
          >
            <span>{note.stress}</span>
          </button>
        ))}
      </div>

      <LockInput
        phrase={phrase}
        lock={lock}
        onInputChange={(value) => onLockInputChange(index, value)}
        onPolicyChange={(policy) => onPolicyChange(index, policy)}
        onClear={() => onClear(index)}
      />

      <div className="phrase-actions">
        <button type="button" className="ghost small" onClick={() => onPlayPhrase(phrase)}>
          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          {isPlaying ? 'Stop line' : 'Play line'}
        </button>
        <button type="button" className="ghost small" disabled={!canMerge} onClick={() => onMerge(index)}>
          <Split size={15} />
          Merge next
        </button>
        <button type="button" className="ghost small" disabled={!canAddSectionMarker} onClick={() => onAddSectionMarker(index)}>
          <Flag size={15} />
          Section here
        </button>
        <span className="hint">
          <Scissors size={14} /> click a note bar to split at it
        </span>
      </div>
    </article>
  );
}
