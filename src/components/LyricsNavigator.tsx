import { Fragment, useEffect, useRef } from 'react';
import type { GeneratedLine, Phrase } from '../types';
import { I } from './Icons';

type Props = {
  phrases: Phrase[];
  output: (GeneratedLine | null)[];
  sectionLabels: string[];
  selectedPhraseId: string | null;
  onSelectPhrase: (id: string) => void;
  onCopyAll: () => void;
  onLockAll: () => void;
};

export function LyricsNavigator({
  phrases,
  output,
  sectionLabels,
  selectedPhraseId,
  onSelectPhrase,
  onCopyAll,
  onLockAll,
}: Props) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPhraseId]);

  if (!output.some((o) => o?.text)) return null;

  return (
    <div className="lyrics-nav panel">
      <div className="lyrics-nav-head">
        <h3>Lyrics</h3>
        <div className="row">
          <button type="button" className="btn ghost small" onClick={onCopyAll} title="Copy all lyrics to clipboard">
            <I.copy /> Copy all
          </button>
          <button type="button" className="btn ghost small" onClick={onLockAll} title="Lock every line">
            <I.lock /> Lock all
          </button>
        </div>
      </div>
      <div className="lyrics-nav-body">
        {phrases.map((phrase, i) => {
          const sec = sectionLabels[i] ?? '';
          const prevSec = i > 0 ? (sectionLabels[i - 1] ?? '') : '';
          const showHeader = sec && sec !== prevSec;
          const text = output[i]?.text ?? '';
          const isSelected = phrase.id === selectedPhraseId;
          return (
            <Fragment key={phrase.id}>
              {showHeader && <div className="lyrics-nav-section">{sec}</div>}
              <button
                ref={isSelected ? selectedRef : undefined}
                type="button"
                className={`lyrics-nav-row ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectPhrase(phrase.id)}
              >
                {text || <span className="muted">(not generated)</span>}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
