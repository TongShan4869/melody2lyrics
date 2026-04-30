import type { LineValidation, LyricsContext, Phrase, PhraseLockState } from './types';
import { isFullyLocked, lockedWordsWithPositions, lockTemplate } from './locks';

export const DEFAULT_FILLER_END_WORDS = [
  'light', 'night', 'tonight', 'fire', 'higher',
  'sky', 'shine', 'bright', 'ignite',
] as const;

export function buildPrompt(phrases: Phrase[], locks: PhraseLockState[], context: LyricsContext, sectionLabels: string[] = []): string {
  const sections = fillSectionLabels(sectionLabels, phrases.length);
  const sectionRhymeMode = isSectionRhymeMode(context.rhymeScheme);
  const rhymes = sectionRhymeMode ? Array.from({ length: phrases.length }, () => '') : sectionRhymeLabels(context.rhymeScheme, sections);
  const rhymePlan = sectionRhymeMode ? sectionRhymePlan(sections) : 'Use the per-line rhyme labels shown below.';

  const lines = phrases.map((phrase, index) => {
    const lock = locks[index];
    const section = sections[index] ? `[${sections[index]}] ` : '';
    const rhyme = rhymes[index] ? `(rhyme: ${rhymes[index]}) ` : '';
    const rhythm = rhythmProfile(phrase);
    const header = `Line ${index + 1} ${section}${rhyme}- ${phrase.syllables} syllables, stress = ${phrase.stressPattern}, rhythm = ${rhythm}, ends ${phrase.endingDirection}`;

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

  const fillerList = DEFAULT_FILLER_END_WORDS.join(', ');

  return `You are writing singable English lyrics to fit an existing melody.

CREATIVE DIRECTION
Theme: ${context.theme || 'open'}
Mood: ${context.mood || 'open'}
Genre: ${context.genre || 'open'}
Point of view: ${context.pov || 'open'}
RHYME PLAN: ${rhymePlan}
- Use rhyme as a section identity, not as repeated filler endings.
- Prefer slant rhyme, internal rhyme, assonance, consonance, and rhythmic echoes over exact repeated end words.
Must include: ${context.mustInclude || 'none'}
Avoid: ${context.avoid || 'none'}

MELODY PROSODY WITH LOCKED CONTENT
${lines.join('\n\n')}

RULES
1. Return exactly ${phrases.length} lyric lines, numbered 1-${phrases.length}.
2. For lines with templates, fill only the [?] slots. Do not change locked words.
3. For fully locked lines, repeat the line verbatim.
4. ${context.strictSyllables ? 'Match each syllable count exactly.' : 'Prefer each target syllable count, but +/- 1 syllable is acceptable when it sounds more natural.'}
5. Preserve stress: strong syllables should land on S positions where possible.
6. Fit note duration: short syllables need quick, crisp sounds; held syllables need stretchable vowels or singable words that can sustain naturally.
7. Avoid cramming consonant-heavy words onto fast notes or tiny filler words onto held notes.
8. ${sectionRhymeMode ? 'For each section, silently choose a specific rhyme family before writing, then keep that section sonically connected without reusing the same final word.' : 'Follow rhyme labels within each section through rhyme families: lines with the same label should feel sonically connected, but should not reuse the same final word.'}
9. Do not add explanations before or after the lyrics.

LYRIC QUALITY CHECK
- Every line must sound like natural contemporary English when spoken aloud.
- Do not use awkward filler, inverted syntax, or vague phrases just to hit syllable counts.
- Do not repeat a full lyric line unless it is locked or explicitly requested.
- Avoid reusing the same final word across multiple lines; vary line endings even inside the same rhyme family.
- Prefer near rhymes and internal rhymes when exact end rhyme would sound forced.
- Avoid default filler rhyme words such as ${fillerList} unless the user specifically requested them.
- Make each section do a different job: chorus can be hooky, rap can be more rhythmic and concrete, pre-chorus should build momentum.
- Before returning, silently revise any line that feels generic, slogan-like, or only exists to complete a rhyme.

OTHER NOTES
${context.otherNotes || 'none'}`;
}

export function fillSectionLabels(labels: string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => labels[index]?.trim() ?? '');
}

export function rhymeLabels(raw: string, count: number): string[] {
  const scheme = raw.trim().toUpperCase();
  if (!scheme || scheme === 'FREE' || scheme === 'SECTION') return Array.from({ length: count }, () => '');
  return cycle(scheme.replace(/[^A-ZX]/g, '').split(''), count).map((label) => label === 'X' ? '' : label);
}

export function sectionRhymeLabels(raw: string, sections: string[]): string[] {
  const scheme = raw.trim().toUpperCase();
  if (!scheme || scheme === 'FREE' || scheme === 'SECTION') return Array.from({ length: sections.length }, () => '');

  const values = scheme.replace(/[^A-ZX]/g, '').split('');
  if (values.length === 0) return Array.from({ length: sections.length }, () => '');

  let currentSection = '';
  let sectionIndex = 0;
  return sections.map((section) => {
    if (section !== currentSection) {
      currentSection = section;
      sectionIndex = 0;
    }

    const label = values[sectionIndex % values.length];
    sectionIndex += 1;
    return label === 'X' ? '' : label;
  });
}

export function sectionRhymePlan(sections: string[]): string {
  const uniqueSections = [...new Set(sections.filter(Boolean))];
  if (uniqueSections.length === 0) {
    return 'Choose one explicit rhyme family for the whole song section.';
  }

  return `Choose one explicit rhyme family per section (${uniqueSections.join(', ')}). Example: Chorus 1 can orbit "-tion/-motion" while Rap verse 1 can orbit "-ee/-ing"; each section should have its own sonic lane.`;
}

function isSectionRhymeMode(raw: string): boolean {
  return raw.trim().toUpperCase() === 'SECTION';
}

export function rhythmProfile(phrase: Phrase): string {
  if (phrase.notes.length === 0) return 'unknown';

  const durations = phrase.notes.map((note) => Math.max(note.duration, 0.001));
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0.001;

  return durations.map((duration) => {
    const ratio = duration / median;
    if (ratio >= 1.75) return 'held';
    if (ratio >= 1.2) return 'long';
    if (ratio <= 0.72) return 'quick';
    return 'short';
  }).join('-');
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

export type RevisionPromptInput = {
  phrases: Phrase[];
  locks: PhraseLockState[];
  sectionLabels: string[];
  context: LyricsContext;
  currentLines: string[];
  validations: LineValidation[];
  previousAttempts: Map<number, string[]>;
};

export function buildRevisionPrompt(input: RevisionPromptInput): string {
  const failingIndices = input.validations
    .filter((v) => !v.passed)
    .map((v) => v.index);

  const initialPrompt = buildPrompt(input.phrases, input.locks, input.context, input.sectionLabels);

  const currentBlock = input.currentLines
    .map((line, index) => {
      const validation = input.validations[index];
      const tag = validation && !validation.passed ? '[FAILING]' : '[KEEP]';
      return `Line ${index + 1} ${tag}: ${line}`;
    })
    .join('\n');

  const failingDetail = failingIndices.map((index) => {
    const validation = input.validations[index];
    const reasons = validation.failures.map((f) => `    - ${f.message}`).join('\n');
    const prior = input.previousAttempts.get(index) ?? [];
    const priorBlock = prior.length
      ? `\n  Previous attempts (do not repeat):\n${prior.map((p) => `    - "${p}"`).join('\n')}\n  Try a different direction.`
      : '';
    return `Line ${index + 1} (${input.phrases[index]?.syllables ?? '?'} syllables, stress = ${input.phrases[index]?.stressPattern ?? ''}):\n${reasons}${priorBlock}`;
  }).join('\n\n');

  return `${initialPrompt}

REVISION TASK
You produced the lines below. Some failed mechanical checks.
REWRITE ONLY the lines marked [FAILING]. Keep [KEEP] lines verbatim.
Return ${input.currentLines.length} numbered lines, in order.

CURRENT DRAFT
${currentBlock}

FAILURES
${failingDetail || '(none)'}
`;
}
