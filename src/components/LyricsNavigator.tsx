import { Fragment, useEffect, useRef } from 'react';
import type { GeneratedLine, Phrase } from '../types';
import { I } from './Icons';

type Props = {
  phrases: Phrase[];
  output: (GeneratedLine | null)[];
  sectionLabels: string[];
  selectedPhraseId: string | null;
  isGenerating: boolean;
  onSelectPhrase: (id: string) => void;
  onCopyAll: () => void;
  onLockAll: () => void;
  onUnlockAll: () => void;
  onExport: () => void;
  onClear: () => void;
};

export function LyricsNavigator({
  phrases,
  output,
  sectionLabels,
  selectedPhraseId,
  isGenerating,
  onSelectPhrase,
  onCopyAll,
  onLockAll,
  onUnlockAll,
  onExport,
  onClear,
}: Props) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const hasOutput = output.some((o) => o?.text);
  const allLocked = output.length > 0 && output.every((l) => l?.locked);

  useEffect(() => {
    if (!hasOutput) return;
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPhraseId, hasOutput]);

  useEffect(() => {
    if (isGenerating) {
      navRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isGenerating]);

  if (!hasOutput && !isGenerating) return null;

  return (
    <div ref={navRef} className={`lyrics-nav panel ${isGenerating ? 'is-generating' : ''}`}>
      <div className="lyrics-nav-head">
        <h3>
          Lyrics
          {isGenerating && <span className="lyrics-nav-spinner" aria-label="Generating" />}
        </h3>
        <div className="row">
          <button type="button" className="btn ghost tiny" onClick={onCopyAll} title="Copy all lyrics to clipboard">
            <I.copy /> Copy
          </button>
          {allLocked ? (
            <button type="button" className="btn ghost tiny" onClick={onUnlockAll} title="Unlock every line">
              <I.unlock /> Unlock all
            </button>
          ) : (
            <button type="button" className="btn ghost tiny" onClick={onLockAll} title="Lock every line">
              <I.lock /> Lock all
            </button>
          )}
          <button type="button" className="btn ghost tiny" onClick={onExport} title="Export lyrics as .txt">
            <I.download /> Export .txt
          </button>
          <button type="button" className="btn ghost tiny" onClick={onClear} title="Clear all generated lyrics">
            <I.x /> Clear
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
                {renderRowContent(text, i, isGenerating)}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function renderRowContent(text: string, lineIdx: number, isGenerating: boolean) {
  if (!text) {
    return (
      <span className={`muted ${isGenerating ? 'generating' : ''}`}>
        {isGenerating ? '(generating…)' : '(not generated)'}
      </span>
    );
  }

  if (!isGenerating) return text;

  // Per-word reveal during generation. Key on text so a revision iteration replays the animation.
  const words = text.split(/(\s+)/);
  return (
    <span key={text} className="words">
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) return word;
        const delay = (lineIdx * 0.18) + (wordIdx * 0.025);
        return (
          <span key={wordIdx} className="word" style={{ animationDelay: `${delay}s` }}>
            {word}
          </span>
        );
      })}
    </span>
  );
}
