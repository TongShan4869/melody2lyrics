import { describe, expect, it } from 'vitest';
import { formatLyricsForCopy } from './lyrics-export';
import type { GeneratedLine } from './types';

const line = (text: string, locked = false): GeneratedLine => ({ text, locked, validation: null });

describe('formatLyricsForCopy', () => {
  it('returns empty string when nothing has been generated', () => {
    expect(formatLyricsForCopy([null, null], ['', ''])).toBe('');
  });

  it('joins lines with newlines and no headers when there are no section labels', () => {
    const output = [line('one line'), line('two line')];
    expect(formatLyricsForCopy(output, ['', ''])).toBe('one line\ntwo line');
  });

  it('emits a section header only at the first phrase of each run', () => {
    const output = [line('v1 line 1'), line('v1 line 2'), line('chorus 1'), line('chorus 2')];
    const result = formatLyricsForCopy(output, ['Verse 1', 'Verse 1', 'Chorus', 'Chorus']);
    expect(result).toBe('[Verse 1]\nv1 line 1\nv1 line 2\n\n[Chorus]\nchorus 1\nchorus 2');
  });

  it('treats null output entries as blank rows but preserves structure', () => {
    const output = [line('first'), null];
    expect(formatLyricsForCopy(output, ['Verse 1', 'Verse 1'])).toBe('[Verse 1]\nfirst\n');
  });

  it('handles a section change between two non-empty rows with a blank line separator before the new header', () => {
    const output = [line('a line'), line('b line')];
    expect(formatLyricsForCopy(output, ['Verse 1', 'Chorus'])).toBe('[Verse 1]\na line\n\n[Chorus]\nb line');
  });

  it('keeps a labeled run intact across an unlabeled row in the middle', () => {
    const output = [line('a line'), line('b line'), line('c line')];
    expect(formatLyricsForCopy(output, ['Verse 1', '', 'Verse 1'])).toBe('[Verse 1]\na line\nb line\nc line');
  });

  it('returns empty string for empty input arrays', () => {
    expect(formatLyricsForCopy([], [])).toBe('');
  });
});
