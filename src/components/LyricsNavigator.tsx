import { Fragment, useEffect, useRef } from 'react';
import type { GeneratedLine, Phrase } from '../types';

type Props = {
  phrases: Phrase[];
  output: (GeneratedLine | null)[];
  sectionLabels: string[];
  selectedPhraseId: string | null;
  onSelectPhrase: (id: string) => void;
};

export function LyricsNavigator({
  phrases,
  output,
  sectionLabels,
  selectedPhraseId,
  onSelectPhrase,
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
