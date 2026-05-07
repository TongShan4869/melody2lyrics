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
  onExport: () => void;
};

export function LyricsNavigator({
  phrases,
  output,
  sectionLabels,
  selectedPhraseId,
  onSelectPhrase,
  onCopyAll,
  onLockAll,
  onExport,
}: Props) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const hasOutput = output.some((o) => o?.text);

  useEffect(() => {
    if (!hasOutput) return;
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPhraseId, hasOutput]);

  if (!hasOutput) return null;

  return (
    <div className="lyrics-nav panel">
      <div className="lyrics-nav-head">
        <h3>Lyrics</h3>
        <div className="row">
          <button type="button" className="btn ghost tiny" onClick={onCopyAll} title="Copy all lyrics to clipboard">
            <I.copy /> Copy
          </button>
          <button type="button" className="btn ghost tiny" onClick={onLockAll} title="Lock every line">
            <I.lock /> Lock all
          </button>
          <button type="button" className="btn ghost tiny" onClick={onExport} title="Export lyrics as .txt">
            <I.download /> Export .txt
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
                className={isSelected ? 'lyrics-nav-row selected' : 'lyrics-nav-row'}
                aria-pressed={isSelected}
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
