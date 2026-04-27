import type { LyricsContext, Phrase, PhraseLockState } from './types';
import { isFullyLocked, lockedWordsWithPositions, lockTemplate } from './locks';

export function buildPrompt(phrases: Phrase[], locks: PhraseLockState[], context: LyricsContext): string {
  const sections = sectionLabels(context.sectionLabels, phrases.length);
  const rhymes = rhymeLabels(context.rhymeScheme, phrases.length);

  const lines = phrases.map((phrase, index) => {
    const lock = locks[index];
    const section = sections[index] ? `[${sections[index]}] ` : '';
    const rhyme = rhymes[index] ? `(rhyme: ${rhymes[index]}) ` : '';
    const header = `Line ${index + 1} ${section}${rhyme}- ${phrase.syllables} syllables, stress = ${phrase.stressPattern}, ends ${phrase.endingDirection}`;

    if (!lock || !lock.rawInput.trim()) {
      return `${header}\n  Template: open (write any ${phrase.syllables}-syllable line)`;
    }

    if (isFullyLocked(lock, phrase.syllables) || lock.lockedAfterGeneration) {
      return `${header}\n  Fully locked, do not modify:\n  "${lock.rawInput}"`;
    }

    const lockedWords = lockedWordsWithPositions(lock)
      .map((word) => `"${word.word}" (${word.syllables} syl, position${word.start === word.end ? '' : 's'} ${word.start}${word.start === word.end ? '' : `-${word.end}`})`)
      .join(', ');

    const mismatch = lock.totalSyllables === phrase.syllables
      ? ''
      : `\n  Policy: ${policyInstruction(lock.policy, lock.totalSyllables, phrase.syllables)}`;

    return `${header}\n  Template: ${lockTemplate(lock, phrase.syllables)}\n  Locked words: ${lockedWords || 'none'}${mismatch}`;
  });

  return `You are writing singable English lyrics to fit an existing melody.

CREATIVE DIRECTION
Theme: ${context.theme || 'open'}
Mood: ${context.mood || 'open'}
Genre: ${context.genre || 'open'}
Point of view: ${context.pov || 'open'}
Must include: ${context.mustInclude || 'none'}
Avoid: ${context.avoid || 'none'}
Notes: ${context.otherNotes || 'none'}

MELODY PROSODY WITH LOCKED CONTENT
${lines.join('\n\n')}

RULES
1. Return exactly ${phrases.length} lyric lines, numbered 1-${phrases.length}.
2. For lines with templates, fill only the [?] slots. Do not change locked words.
3. For fully locked lines, repeat the line verbatim.
4. ${context.strictSyllables ? 'Match each syllable count exactly.' : 'Prefer each target syllable count, but +/- 1 syllable is acceptable when it sounds more natural.'}
5. Preserve stress: strong syllables should land on S positions where possible.
6. Follow the rhyme labels as closely as natural language allows.
7. Do not add explanations before or after the lyrics.`;
}

export function sectionLabels(raw: string, count: number): string[] {
  return cycle(raw.split(',').map((item) => item.trim()).filter(Boolean), count);
}

export function rhymeLabels(raw: string, count: number): string[] {
  const scheme = raw.trim().toUpperCase();
  if (!scheme || scheme === 'FREE') return Array.from({ length: count }, () => '');
  return cycle(scheme.replace(/[^A-ZX]/g, '').split(''), count);
}

function cycle(values: string[], count: number): string[] {
  if (values.length === 0) return Array.from({ length: count }, () => '');
  return Array.from({ length: count }, (_, index) => values[index % values.length]);
}

function policyInstruction(policy: PhraseLockState['policy'], current: number, target: number): string {
  if (policy === 'trim') return `locked content has ${current}/${target} syllables; shorten only where necessary while preserving the user's intent.`;
  if (policy === 'pad') return `locked content has ${current}/${target} syllables; add natural words around locked content until the line fits.`;
  if (policy === 'auto') return `locked content has ${current}/${target} syllables; decide whether trimming or padding creates the most singable line.`;
  return `strict mismatch: do not generate this line until the user fixes the template.`;
}
