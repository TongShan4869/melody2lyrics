import { describe, expect, it } from 'vitest';
import { formatLyricsForCopy } from './lyrics-export';
import type { Phrase, GeneratedLine } from './types';

const makePhrase = (id: string): Phrase => ({
  id,
  notes: [],
  syllables: 0,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

const line = (text: string, locked = false): GeneratedLine => ({ text, locked, validation: null });

describe('formatLyricsForCopy', () => {
  it('returns empty string when nothing has been generated', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    expect(formatLyricsForCopy(phrases, [null, null], ['', ''])).toBe('');
  });

  it('joins lines with newlines and no headers when there are no section labels', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    const output = [line('one line'), line('two line')];
    expect(formatLyricsForCopy(phrases, output, ['', ''])).toBe('one line\ntwo line');
  });

  it('emits a section header only at the first phrase of each run', () => {
    const phrases = [makePhrase('a'), makePhrase('b'), makePhrase('c'), makePhrase('d')];
    const output = [line('v1 line 1'), line('v1 line 2'), line('chorus 1'), line('chorus 2')];
    const result = formatLyricsForCopy(phrases, output, ['Verse 1', 'Verse 1', 'Chorus', 'Chorus']);
    expect(result).toBe('[Verse 1]\nv1 line 1\nv1 line 2\n\n[Chorus]\nchorus 1\nchorus 2');
  });

  it('treats null output entries as blank rows but preserves structure', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    const output = [line('first'), null];
    expect(formatLyricsForCopy(phrases, output, ['Verse 1', 'Verse 1'])).toBe('[Verse 1]\nfirst\n');
  });

  it('handles a section change between two non-empty rows with a blank line separator before the new header', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    const output = [line('a line'), line('b line')];
    expect(formatLyricsForCopy(phrases, output, ['Verse 1', 'Chorus'])).toBe('[Verse 1]\na line\n\n[Chorus]\nb line');
  });
});
