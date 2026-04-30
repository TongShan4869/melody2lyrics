# Agentic Lyric Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-shot prompt+generate flow with a deterministic agentic pipeline (generate → validate → targeted-revise, capped at 3 iterations) plus melodic-repetition section detection at MIDI upload, with the same one-screen UX.

**Architecture:** Pure pipeline modules (`structure`, `validators`, `vowels`, `agent`) consumed by `App.tsx`. Controller (`agent.ts`) takes an `LLMCall` function as a dependency so it does not depend on `fetch` or any provider — keeps the loop server-portable later. Browser-only deployment, no backend changes, all three existing providers continue to work.

**Tech Stack:** React 18 + TypeScript + Vite + Vitest, `@tonejs/midi`, `syllable`, `lucide-react`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-29-agentic-lyric-pipeline-design.md`

---

## File Structure

**New files:**
- `src/vowels.ts` — embedded ARPAbet final-vowel lookup for held-vowel validator
- `src/vowels.test.ts`
- `src/validators.ts` — six pure validators + `validateLines` aggregator
- `src/validators.test.ts`
- `src/structure.ts` — phrase similarity + section auto-labeling
- `src/structure.test.ts`
- `src/agent.ts` — `runPipeline` async generator (the controller)
- `src/agent.test.ts`

**Modified files:**
- `src/types.ts` — adds `ValidationFailure`, `LineValidation`, `Iteration`, `IterationLog`, `PipelineInput`, `PhraseOrigin`
- `src/prompt.ts` — extracts filler list to exported constant; adds `buildRevisionPrompt`
- `src/prompt.test.ts` — adds revision-prompt tests
- `src/prosody.ts` — adds optional downbeat-snap to oversized-phrase splits
- `src/prosody.test.ts` — adds snap test
- `src/App.tsx` — replaces `generateLyrics` with pipeline call; adds iteration log, status badges, auto chips, recurrence hint, "Revise rest" button
- `src/styles.css` — styles for iteration log, badges, auto chip, hint banner

---

## Task 1: Add new types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Append new types to `src/types.ts`**

Add at the end of the file:

```ts
export type ValidationFailureType =
  | 'syllables'
  | 'locked-words'
  | 'end-collision'
  | 'filler'
  | 'held-vowel'
  | 'avoid';

export type ValidationFailure = {
  type: ValidationFailureType;
  message: string;
};

export type LineValidation = {
  index: number;
  text: string;
  passed: boolean;
  failures: ValidationFailure[];
};

export type Iteration = {
  number: number;
  kind: 'initial' | 'revise';
  output: string[];
  validations: LineValidation[];
  failingIndices: number[];
};

export type IterationLog = {
  iterations: Iteration[];
  finalStatus: 'clean' | 'capped' | 'error' | 'idle';
  errorMessage?: string;
};

export type LLMCall = (prompt: string, signal?: AbortSignal) => Promise<string>;

export type PipelineInput = {
  phrases: Phrase[];
  locks: PhraseLockState[];
  sectionLabels: string[];
  context: LyricsContext;
  pinnedLines: Map<number, string>;
  llmCall: LLMCall;
  maxIterations?: number;
  signal?: AbortSignal;
};

export type PhraseOrigin = 'auto' | 'manual';
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "Add types for agentic pipeline (validators, iterations)"
```

---

## Task 2: Extract filler-word constant from prompt.ts

**Files:**
- Modify: `src/prompt.ts`

- [ ] **Step 1: Add an exported constant near the top of `src/prompt.ts`**

After the imports, add:

```ts
export const DEFAULT_FILLER_END_WORDS = [
  'light', 'night', 'tonight', 'fire', 'higher',
  'sky', 'shine', 'bright', 'ignite',
] as const;
```

- [ ] **Step 2: Replace the hardcoded list inside the prompt template**

Find this line in the `buildPrompt` return string:

```
- Avoid default filler rhyme words such as light, night, tonight, fire, higher, sky, shine, bright, and ignite unless the user specifically requested them.
```

Replace with a backtick-template line that reads from the constant:

```ts
const fillerList = DEFAULT_FILLER_END_WORDS.join(', ');
```

(Insert that just before the `return \`...\`` in `buildPrompt`.)

Then change the line in the template literal to:

```
- Avoid default filler rhyme words such as ${fillerList} unless the user specifically requested them.
```

- [ ] **Step 3: Run existing prompt tests**

Run: `npx vitest run src/prompt.test.ts`
Expected: all existing tests still pass. If a test asserts the literal phrase, update it to match the templated output.

- [ ] **Step 4: Commit**

```bash
git add src/prompt.ts src/prompt.test.ts
git commit -m "Extract filler-word list as DEFAULT_FILLER_END_WORDS"
```

---

## Task 3: Vowels module — table and lookup

**Files:**
- Create: `src/vowels.ts`
- Test: `src/vowels.test.ts`

- [ ] **Step 1: Write the failing test in `src/vowels.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { finalVowel, isOpenVowel } from './vowels';

describe('finalVowel', () => {
  it('returns ARPAbet final vowel for known words', () => {
    expect(finalVowel('day')).toBe('EY');
    expect(finalVowel('you')).toBe('UW');
    expect(finalVowel('see')).toBe('IY');
    expect(finalVowel('night')).toBe('AY');
    expect(finalVowel('love')).toBe('AH');
  });

  it('is case-insensitive and strips punctuation', () => {
    expect(finalVowel('Day.')).toBe('EY');
    expect(finalVowel('You,')).toBe('UW');
  });

  it('returns null for unknown words', () => {
    expect(finalVowel('xyzzy')).toBeNull();
  });
});

describe('isOpenVowel', () => {
  it('treats sustainable vowels as open', () => {
    expect(isOpenVowel('EY')).toBe(true);
    expect(isOpenVowel('AY')).toBe(true);
    expect(isOpenVowel('OW')).toBe(true);
    expect(isOpenVowel('UW')).toBe(true);
    expect(isOpenVowel('IY')).toBe(true);
  });

  it('treats closed and reduced vowels as not open', () => {
    expect(isOpenVowel('AH')).toBe(false);
    expect(isOpenVowel('IH')).toBe(false);
    expect(isOpenVowel('UH')).toBe(false);
    expect(isOpenVowel('EH')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/vowels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/vowels.ts`**

```ts
export type ArpabetVowel =
  | 'AA' | 'AE' | 'AH' | 'AO' | 'AW' | 'AY'
  | 'EH' | 'ER' | 'EY'
  | 'IH' | 'IY'
  | 'OW' | 'OY'
  | 'UH' | 'UW';

const OPEN_SET: ReadonlySet<ArpabetVowel> = new Set([
  'EY', 'AY', 'OW', 'AW', 'AA', 'AO', 'OY', 'UW', 'IY',
]);

export function isOpenVowel(vowel: ArpabetVowel): boolean {
  return OPEN_SET.has(vowel);
}

const FINAL_VOWELS: Record<string, ArpabetVowel> = {
  // -EY (day, way, stay)
  day: 'EY', way: 'EY', stay: 'EY', away: 'EY', today: 'EY', say: 'EY',
  pay: 'EY', play: 'EY', okay: 'EY', maybe: 'IY',

  // -AY (sky, fly, try, eye)
  sky: 'AY', fly: 'AY', try: 'AY', eye: 'AY', why: 'AY', high: 'AY',
  cry: 'AY', goodbye: 'AY', tonight: 'AY', light: 'AY', night: 'AY',
  bright: 'AY', ignite: 'AY', alright: 'AY', fight: 'AY', sight: 'AY',
  mine: 'AY', line: 'AY', time: 'AY', mind: 'AY', find: 'AY',

  // -OW (slow, road, gold, alone, gone)
  slow: 'OW', road: 'OW', gold: 'OW', know: 'OW', go: 'OW', so: 'OW',
  alone: 'OW', soul: 'OW', control: 'OW', hold: 'OW', cold: 'OW',
  home: 'OW', ago: 'OW', tomorrow: 'OW',

  // -UW (you, do, blue, true)
  you: 'UW', do: 'UW', blue: 'UW', true: 'UW', through: 'UW', view: 'UW',
  too: 'UW', who: 'UW', new: 'UW', knew: 'UW', few: 'UW',

  // -IY (see, free, me, three, dream)
  see: 'IY', free: 'IY', me: 'IY', three: 'IY', dream: 'IY', scheme: 'IY',
  be: 'IY', we: 'IY', he: 'IY', she: 'IY', key: 'IY', sea: 'IY',
  believe: 'IY',

  // -AW (now, down, how)
  now: 'AW', down: 'AW', how: 'AW', around: 'AW', sound: 'AW',

  // -AA (far, heart, start, are)
  far: 'AA', heart: 'AA', start: 'AA', are: 'AA', star: 'AA', dark: 'AA',
  hard: 'AA',

  // -AO (saw, fall, all, call)
  saw: 'AO', fall: 'AO', all: 'AO', call: 'AO', small: 'AO', tall: 'AO',
  ball: 'AO', wall: 'AO', talk: 'AO',

  // -OY (boy, joy)
  boy: 'OY', joy: 'OY', toy: 'OY', destroy: 'OY',

  // closed / reduced (counter-examples — held-unfriendly)
  love: 'AH', above: 'AH', enough: 'AH',
  it: 'IH', this: 'IH', wish: 'IH',
  her: 'ER', word: 'ER', heard: 'ER',
  good: 'UH', could: 'UH', should: 'UH',
  red: 'EH', said: 'EH',
  bad: 'AE', back: 'AE',
};

export function finalVowel(word: string): ArpabetVowel | null {
  const cleaned = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!cleaned) return null;
  return FINAL_VOWELS[cleaned] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/vowels.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vowels.ts src/vowels.test.ts
git commit -m "Add vowels module with starter ARPAbet final-vowel table"
```

---

## Task 4: Syllable-count validator

**Files:**
- Create: `src/validators.ts`
- Test: `src/validators.test.ts`

- [ ] **Step 1: Write the failing test in `src/validators.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { syllableValidator } from './validators';
import type { Phrase } from './types';

const phrase = (syllables: number): Phrase => ({
  id: 'p',
  notes: [],
  syllables,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

describe('syllableValidator', () => {
  it('passes when count matches', () => {
    const result = syllableValidator('hello world today', phrase(5), { strict: true });
    expect(result).toBeNull();
  });

  it('fails when count differs in strict mode', () => {
    const result = syllableValidator('hello world', phrase(5), { strict: true });
    expect(result).toEqual({
      type: 'syllables',
      message: expect.stringContaining('3'),
    });
  });

  it('allows ±1 when not strict', () => {
    expect(syllableValidator('hello world today now', phrase(5), { strict: false })).toBeNull();
    expect(syllableValidator('hello world ok', phrase(5), { strict: false })).toBeNull();
  });

  it('still fails ±2 when not strict', () => {
    const result = syllableValidator('hi there', phrase(5), { strict: false });
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `syllableValidator` in `src/validators.ts`**

```ts
import type { Phrase, ValidationFailure } from './types';
import { countSyllables } from './syllables';

export function syllableValidator(
  line: string,
  phrase: Phrase,
  opts: { strict: boolean },
): ValidationFailure | null {
  const counted = line.trim().split(/\s+/).filter(Boolean)
    .reduce((sum, token) => sum + countSyllables(token), 0);
  const target = phrase.syllables;
  const diff = Math.abs(counted - target);
  const tolerance = opts.strict ? 0 : 1;
  if (diff <= tolerance) return null;
  return {
    type: 'syllables',
    message: `${counted} syllables, target ${target}`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add syllable-count validator"
```

---

## Task 5: Locked-words validator wrapper

**Files:**
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Add a failing test for locked-words wrapper**

Append to `src/validators.test.ts`:

```ts
import { lockedWordsValidator } from './validators';
import { parseLockInput } from './locks';

describe('lockedWordsValidator', () => {
  it('passes when locked words appear in order', () => {
    const lock = parseLockInput('_ love _ you', 0);
    expect(lockedWordsValidator('I love being with you', lock)).toBeNull();
  });

  it('fails when a locked word is missing', () => {
    const lock = parseLockInput('_ love _ you', 0);
    const result = lockedWordsValidator('I miss being with you', lock);
    expect(result).toEqual({
      type: 'locked-words',
      message: expect.stringContaining('love'),
    });
  });

  it('passes when there are no locked words', () => {
    const lock = parseLockInput('', 0);
    expect(lockedWordsValidator('anything goes here', lock)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL — `lockedWordsValidator` not exported.

- [ ] **Step 3: Implement `lockedWordsValidator` in `src/validators.ts`**

Append:

```ts
import type { PhraseLockState } from './types';
import { validateLockedWords } from './locks';

export function lockedWordsValidator(
  line: string,
  lock: PhraseLockState,
): ValidationFailure | null {
  const result = validateLockedWords(line, lock);
  if (result.valid) return null;
  return {
    type: 'locked-words',
    message: result.message ?? 'locked-word mismatch',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add locked-words validator wrapping existing check"
```

---

## Task 6: End-collision validator

**Files:**
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/validators.test.ts`:

```ts
import { endCollisionValidator } from './validators';

describe('endCollisionValidator', () => {
  it('passes when section lines have unique end words', () => {
    const lines = ['I see the rain', 'falling on me', 'taking it slow'];
    const sections = ['Verse 1', 'Verse 1', 'Verse 1'];
    expect(endCollisionValidator(lines, sections, 0)).toBeNull();
    expect(endCollisionValidator(lines, sections, 1)).toBeNull();
    expect(endCollisionValidator(lines, sections, 2)).toBeNull();
  });

  it('fails when two lines in the same section share their end word', () => {
    const lines = ['into the night', 'shining so bright', 'wide awake tonight'];
    const sections = ['Verse 1', 'Verse 1', 'Verse 1'];
    const result = endCollisionValidator(lines, sections, 2);
    expect(result).toBeNull();
    const a = endCollisionValidator([
      'falling for you',
      'reaching for you',
    ], ['Verse 1', 'Verse 1'], 1);
    expect(a).toEqual({
      type: 'end-collision',
      message: expect.stringContaining('you'),
    });
  });

  it('does not flag collisions across different sections', () => {
    const lines = ['falling for you', 'reaching for you'];
    const sections = ['Verse 1', 'Chorus 1'];
    expect(endCollisionValidator(lines, sections, 1)).toBeNull();
  });

  it('strips punctuation and is case-insensitive', () => {
    const lines = ['I am here.', 'You are HERE!'];
    const sections = ['Verse 1', 'Verse 1'];
    const result = endCollisionValidator(lines, sections, 1);
    expect(result?.type).toBe('end-collision');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL — `endCollisionValidator` not exported.

- [ ] **Step 3: Implement in `src/validators.ts`**

Append:

```ts
function endWord(line: string): string {
  const tokens = line.trim().toLowerCase().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? '';
  return last.replace(/[^a-z']/g, '');
}

export function endCollisionValidator(
  lines: string[],
  sectionLabels: string[],
  index: number,
): ValidationFailure | null {
  const section = sectionLabels[index] ?? '';
  const target = endWord(lines[index] ?? '');
  if (!target) return null;

  for (let i = 0; i < lines.length; i += 1) {
    if (i === index) continue;
    if ((sectionLabels[i] ?? '') !== section) continue;
    if (endWord(lines[i] ?? '') === target) {
      return {
        type: 'end-collision',
        message: `ends in "${target}" — collides with line ${i + 1}`,
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add end-word collision validator (within same section)"
```

---

## Task 7: Filler-ending validator

**Files:**
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { fillerEndingValidator } from './validators';

describe('fillerEndingValidator', () => {
  it('fails when line ends in a default filler word', () => {
    const result = fillerEndingValidator('falling through the night', '');
    expect(result).toEqual({
      type: 'filler',
      message: expect.stringContaining('night'),
    });
  });

  it('passes when filler word is in mustInclude', () => {
    expect(fillerEndingValidator('falling through the night', 'night, dream')).toBeNull();
  });

  it('passes for non-filler endings', () => {
    expect(fillerEndingValidator('I will see you soon', '')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/validators.ts`**

Append:

```ts
import { DEFAULT_FILLER_END_WORDS } from './prompt';

function tokenizeMustInclude(raw: string): Set<string> {
  return new Set(
    raw.toLowerCase().split(/[,\s]+/).map((token) => token.trim()).filter(Boolean),
  );
}

export function fillerEndingValidator(
  line: string,
  mustInclude: string,
): ValidationFailure | null {
  const target = endWord(line);
  if (!target) return null;
  const allowed = tokenizeMustInclude(mustInclude);
  if (allowed.has(target)) return null;
  if ((DEFAULT_FILLER_END_WORDS as readonly string[]).includes(target)) {
    return {
      type: 'filler',
      message: `ends in default filler word "${target}"`,
    };
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add filler-ending validator"
```

---

## Task 8: Held-vowel validator

**Files:**
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { heldVowelValidator } from './validators';
import type { Phrase, AnalyzedNote } from './types';

const note = (duration: number): AnalyzedNote => ({
  id: 'n', midi: 60, pitch: 'C4', time: 0, duration, velocity: 0.8,
  stressScore: 0.5, stress: 'w',
});

const phraseWith = (durations: number[]): Phrase => ({
  id: 'p',
  notes: durations.map(note),
  syllables: durations.length,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

describe('heldVowelValidator', () => {
  it('passes when final note is not held', () => {
    const phrase = phraseWith([1, 1, 1, 1]); // all equal -> none held
    expect(heldVowelValidator('I am right here', phrase)).toBeNull();
  });

  it('passes when final note is held and ends in an open vowel', () => {
    const phrase = phraseWith([0.25, 0.25, 0.25, 1.5]); // last note held
    expect(heldVowelValidator('walking far away', phrase)).toBeNull();
  });

  it('fails when final note is held and ends in a closed vowel', () => {
    const phrase = phraseWith([0.25, 0.25, 0.25, 1.5]);
    const result = heldVowelValidator('something I love', phrase);
    expect(result).toEqual({
      type: 'held-vowel',
      message: expect.any(String),
    });
  });

  it('passes when final word is unknown (skip)', () => {
    const phrase = phraseWith([0.25, 0.25, 0.25, 1.5]);
    expect(heldVowelValidator('whispering xyzzy', phrase)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement using `rhythmProfile` logic from `prompt.ts`**

Append to `src/validators.ts`:

```ts
import { finalVowel, isOpenVowel } from './vowels';

function isFinalNoteHeld(phrase: Phrase): boolean {
  if (phrase.notes.length === 0) return false;
  const durations = phrase.notes.map((n) => Math.max(n.duration, 0.001));
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0.001;
  const last = durations[durations.length - 1];
  return last / median >= 1.75;
}

function lastWord(line: string): string {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? '';
}

export function heldVowelValidator(
  line: string,
  phrase: Phrase,
): ValidationFailure | null {
  if (!isFinalNoteHeld(phrase)) return null;
  const word = lastWord(line);
  const vowel = finalVowel(word);
  if (vowel === null) return null;
  if (isOpenVowel(vowel)) return null;
  return {
    type: 'held-vowel',
    message: `final note is held but "${word}" ends in a closed vowel (${vowel})`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add held-vowel validator using ARPAbet table"
```

---

## Task 9: Avoid-words validator

**Files:**
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { avoidWordsValidator } from './validators';

describe('avoidWordsValidator', () => {
  it('passes when no avoid words appear', () => {
    expect(avoidWordsValidator('walking through the rain', 'neon, dreams')).toBeNull();
  });

  it('fails when an avoid word appears', () => {
    const result = avoidWordsValidator('chasing neon dreams', 'neon, dreams');
    expect(result).toEqual({
      type: 'avoid',
      message: expect.stringContaining('neon'),
    });
  });

  it('passes when avoid is empty', () => {
    expect(avoidWordsValidator('chasing neon dreams', '')).toBeNull();
  });

  it('is case-insensitive and accepts whitespace separators', () => {
    expect(avoidWordsValidator('Chasing NEON dreams', 'neon dreams')?.type).toBe('avoid');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/validators.ts`**

Append:

```ts
export function avoidWordsValidator(
  line: string,
  avoid: string,
): ValidationFailure | null {
  const tokens = avoid.toLowerCase().split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;
  const cleaned = ` ${line.toLowerCase().replace(/[^a-z'\s]/g, ' ')} `;
  for (const token of tokens) {
    if (cleaned.includes(` ${token} `)) {
      return {
        type: 'avoid',
        message: `contains avoid word "${token}"`,
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add avoid-words validator"
```

---

## Task 10: validateLines aggregator

**Files:**
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Add failing test for aggregator**

```ts
import { validateLines } from './validators';
import type { LyricsContext, Phrase, PhraseLockState } from './types';
import { parseLockInput } from './locks';

const ctx: LyricsContext = {
  theme: '', mood: '', genre: '', pov: '', otherNotes: '',
  mustInclude: '', avoid: '', rhymeScheme: 'SECTION', strictSyllables: true,
};

describe('validateLines', () => {
  it('aggregates failures per line', () => {
    const phrases: Phrase[] = [
      { id: 'p1', notes: [], syllables: 5, stressPattern: '', endingDirection: 'level', startTime: 0, endTime: 0 },
      { id: 'p2', notes: [], syllables: 5, stressPattern: '', endingDirection: 'level', startTime: 0, endTime: 0 },
    ];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sections = ['Verse 1', 'Verse 1'];
    const lines = ['hello world tonight', 'shining bright tonight'];

    const result = validateLines(lines, phrases, locks, sections, ctx);

    expect(result).toHaveLength(2);
    expect(result[0].passed).toBe(false);
    expect(result[1].passed).toBe(false);
    const types1 = result[1].failures.map((f) => f.type).sort();
    expect(types1).toContain('end-collision');
    expect(types1).toContain('filler');
  });

  it('marks passing lines as passed', () => {
    const phrases: Phrase[] = [
      { id: 'p1', notes: [], syllables: 5, stressPattern: '', endingDirection: 'level', startTime: 0, endTime: 0 },
    ];
    const locks: PhraseLockState[] = [parseLockInput('', 0)];
    const sections = ['Verse 1'];
    const lines = ['I will see you soon'];

    const result = validateLines(lines, phrases, locks, sections, ctx);
    expect(result[0].passed).toBe(true);
    expect(result[0].failures).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validators.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `validateLines` in `src/validators.ts`**

Append:

```ts
import type { LineValidation, LyricsContext } from './types';

export function validateLines(
  lines: string[],
  phrases: Phrase[],
  locks: PhraseLockState[],
  sectionLabels: string[],
  context: LyricsContext,
): LineValidation[] {
  return lines.map((line, index) => {
    const phrase = phrases[index];
    const lock = locks[index];
    const failures: ValidationFailure[] = [];
    const push = (failure: ValidationFailure | null) => {
      if (failure) failures.push(failure);
    };

    if (phrase) push(syllableValidator(line, phrase, { strict: context.strictSyllables }));
    if (lock) push(lockedWordsValidator(line, lock));
    push(endCollisionValidator(lines, sectionLabels, index));
    push(fillerEndingValidator(line, context.mustInclude));
    if (phrase) push(heldVowelValidator(line, phrase));
    push(avoidWordsValidator(line, context.avoid));

    return {
      index,
      text: line,
      passed: failures.length === 0,
      failures,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validators.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validators.ts src/validators.test.ts
git commit -m "Add validateLines aggregator running all six validators"
```

---

## Task 11: Structure detection — pitch contour similarity

**Files:**
- Create: `src/structure.ts`
- Test: `src/structure.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { phraseSimilarity } from './structure';
import type { Phrase, AnalyzedNote } from './types';

const makeNote = (midi: number, duration: number): AnalyzedNote => ({
  id: `${midi}-${duration}`,
  midi,
  pitch: 'C4',
  time: 0,
  duration,
  velocity: 0.8,
  stressScore: 0.5,
  stress: 'w',
});

const makePhrase = (pitches: number[], durations: number[]): Phrase => ({
  id: 'p',
  notes: pitches.map((p, i) => makeNote(p, durations[i] ?? 1)),
  syllables: pitches.length,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

describe('phraseSimilarity', () => {
  it('returns ~1 for identical phrases', () => {
    const a = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const b = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    expect(phraseSimilarity(a, b)).toBeGreaterThan(0.95);
  });

  it('returns ~1 for transposed identical contour', () => {
    const a = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const b = makePhrase([67, 69, 71, 72], [1, 1, 1, 1]);
    expect(phraseSimilarity(a, b)).toBeGreaterThan(0.9);
  });

  it('returns low score for different contours', () => {
    const a = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const b = makePhrase([72, 65, 70, 60], [1, 1, 1, 1]);
    expect(phraseSimilarity(a, b)).toBeLessThan(0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/structure.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `phraseSimilarity` in `src/structure.ts`**

```ts
import type { Phrase } from './types';

function resample(values: number[], length: number): number[] {
  if (values.length === 0) return new Array(length).fill(0);
  if (values.length === length) return values;
  const out = new Array<number>(length);
  for (let i = 0; i < length; i += 1) {
    const t = (i / Math.max(1, length - 1)) * (values.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(values.length - 1, lo + 1);
    const frac = t - lo;
    out[i] = values[lo] * (1 - frac) + values[hi] * frac;
  }
  return out;
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  return denom === 0 ? 1 : num / denom;
}

export function phraseSimilarity(a: Phrase, b: Phrase): number {
  if (a.notes.length === 0 || b.notes.length === 0) return 0;
  const length = Math.max(a.notes.length, b.notes.length);
  const aPitch = resample(a.notes.map((n) => n.midi), length);
  const bPitch = resample(b.notes.map((n) => n.midi), length);
  const pitchScore = (correlation(aPitch, bPitch) + 1) / 2;

  const aMedian = median(a.notes.map((n) => n.duration));
  const bMedian = median(b.notes.map((n) => n.duration));
  const aRhythm = resample(a.notes.map((n) => n.duration / aMedian), length);
  const bRhythm = resample(b.notes.map((n) => n.duration / bMedian), length);
  const rhythmScore = (correlation(aRhythm, bRhythm) + 1) / 2;

  const lengthScore = a.syllables === b.syllables ? 1 : 0.5;

  return 0.55 * pitchScore + 0.3 * rhythmScore + 0.15 * lengthScore;
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] || 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/structure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/structure.ts src/structure.test.ts
git commit -m "Add phraseSimilarity scoring (pitch contour + rhythm)"
```

---

## Task 12: Structure detection — clustering and labeling

**Files:**
- Modify: `src/structure.ts`
- Modify: `src/structure.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
import { detectSections } from './structure';

describe('detectSections', () => {
  it('labels a single phrase as Verse 1', () => {
    const phrases = [makePhrase([60, 62, 64, 65], [1, 1, 1, 1])];
    expect(detectSections(phrases)).toEqual(['Verse 1']);
  });

  it('detects a repeating chorus', () => {
    const verseA = makePhrase([60, 62, 64, 65], [1, 1, 1, 1]);
    const verseB = makePhrase([62, 64, 65, 67], [1, 1, 1, 1]);
    const chorus = makePhrase([72, 70, 67, 65], [1, 1, 1, 2]);
    const labels = detectSections([verseA, verseB, chorus, verseA, verseB, chorus]);
    expect(labels).toEqual([
      'Verse 1', 'Verse 1', 'Chorus 1',
      'Verse 2', 'Verse 2', 'Chorus 2',
    ]);
  });

  it('falls back to sequential labels for fully unique phrases', () => {
    const a = makePhrase([60, 62], [1, 1]);
    const b = makePhrase([72, 65], [1, 1]);
    const c = makePhrase([55, 53], [1, 1]);
    const labels = detectSections([a, b, c]);
    expect(labels).toEqual(['Verse 1', 'Verse 1', 'Verse 1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/structure.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `detectSections` in `src/structure.ts`**

Append:

```ts
const SIMILARITY_THRESHOLD = 0.85;

export function detectSections(phrases: Phrase[]): string[] {
  if (phrases.length === 0) return [];

  const clusterId = new Array(phrases.length).fill(-1);
  let nextCluster = 0;
  for (let i = 0; i < phrases.length; i += 1) {
    if (clusterId[i] !== -1) continue;
    clusterId[i] = nextCluster;
    for (let j = i + 1; j < phrases.length; j += 1) {
      if (clusterId[j] !== -1) continue;
      if (phraseSimilarity(phrases[i], phrases[j]) >= SIMILARITY_THRESHOLD) {
        clusterId[j] = nextCluster;
      }
    }
    nextCluster += 1;
  }

  const clusterSize = new Array(nextCluster).fill(0);
  for (const id of clusterId) clusterSize[id] += 1;

  // The largest recurring cluster (size >= 2) becomes Chorus.
  let chorusCluster = -1;
  let chorusSize = 1;
  for (let id = 0; id < nextCluster; id += 1) {
    if (clusterSize[id] >= 2 && clusterSize[id] > chorusSize) {
      chorusCluster = id;
      chorusSize = clusterSize[id];
    }
  }

  const baseName = (id: number): string => {
    if (id === chorusCluster) return 'Chorus';
    if (clusterSize[id] >= 2) return 'Section';
    return 'Verse';
  };

  const counters = new Map<string, number>();
  const seen = new Map<number, number>();
  return clusterId.map((id) => {
    const name = baseName(id);
    if (seen.has(id)) {
      return `${name} ${seen.get(id)}`;
    }
    const next = (counters.get(name) ?? 0) + 1;
    counters.set(name, next);
    seen.set(id, next);
    return `${name} ${next}`;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/structure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/structure.ts src/structure.test.ts
git commit -m "Add detectSections clustering with chorus heuristic"
```

---

## Task 13: Prosody downbeat-snap option

**Files:**
- Modify: `src/prosody.ts`
- Modify: `src/prosody.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/prosody.test.ts`:

```ts
import { analyzeNotes } from './prosody';
import type { Note } from './types';

describe('analyzeNotes downbeat snap', () => {
  it('prefers splitting an oversized phrase at a metric downbeat', () => {
    const notes: Note[] = Array.from({ length: 24 }, (_, i) => ({
      id: `n${i}`,
      midi: 60 + (i % 5),
      pitch: 'C4',
      time: i * 0.25,
      duration: 0.25,
      velocity: 0.8,
      ticks: i * 480,
      durationTicks: 480,
      ppq: 480,
      timeSignature: [4, 4] as [number, number],
    }));
    const phrases = analyzeNotes(notes);
    expect(phrases.length).toBeGreaterThanOrEqual(2);
    const firstLength = phrases[0].notes.length;
    expect(firstLength % 4).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes by accident**

Run: `npx vitest run src/prosody.test.ts`
Expected: FAIL (current oversized-split is heuristic but may not align to downbeats).

- [ ] **Step 3: Modify `splitOversizedPhrase` and `isStrongLineStart` in `src/prosody.ts`**

Replace the existing `isStrongLineStart` function with a stricter downbeat check:

```ts
function isStrongLineStart(note: Note, phraseStart: Note, estimatedBeat: number): boolean {
  if (note.ticks != null && note.ppq != null && note.ppq > 0) {
    const [numerator, denominator] = note.timeSignature ?? [4, 4];
    const ticksPerBeat = note.ppq * (4 / denominator);
    const ticksPerBar = ticksPerBeat * numerator;
    const tickInBar = positiveModulo(note.ticks, ticksPerBar);
    const beatInBar = Math.round(tickInBar / ticksPerBeat);
    const aligned = Math.abs(tickInBar - beatInBar * ticksPerBeat) < ticksPerBeat * 0.1;
    return aligned && beatInBar === 0;
  }
  return metricStress(note, phraseStart, estimatedBeat) >= STRONG_STRESS_THRESHOLD;
}
```

- [ ] **Step 4: Run all prosody tests**

Run: `npx vitest run src/prosody.test.ts`
Expected: all PASS, including the new downbeat-snap test and existing regression tests.

- [ ] **Step 5: Commit**

```bash
git add src/prosody.ts src/prosody.test.ts
git commit -m "Snap oversized phrase splits to downbeats when tick data is available"
```

---

## Task 14: Revision prompt builder

**Files:**
- Modify: `src/prompt.ts`
- Modify: `src/prompt.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/prompt.test.ts`:

```ts
import { buildRevisionPrompt } from './prompt';
import type { Phrase, LyricsContext } from './types';

const fixturePhrase = (id: string, syllables: number): Phrase => ({
  id, notes: [], syllables,
  stressPattern: 'w-S-w-S-w',
  endingDirection: 'level',
  startTime: 0, endTime: 0,
});

const fixtureContext: LyricsContext = {
  theme: '', mood: '', genre: '', pov: '', otherNotes: '',
  mustInclude: '', avoid: '', rhymeScheme: 'SECTION', strictSyllables: true,
};

describe('buildRevisionPrompt', () => {
  it('marks failing lines and instructs to keep others verbatim', () => {
    const prompt = buildRevisionPrompt({
      phrases: [fixturePhrase('p1', 5), fixturePhrase('p2', 5)],
      locks: [],
      sectionLabels: ['Verse 1', 'Verse 1'],
      context: fixtureContext,
      currentLines: ['line one ok', 'line two failing'],
      validations: [
        { index: 0, text: 'line one ok', passed: true, failures: [] },
        { index: 1, text: 'line two failing', passed: false, failures: [{ type: 'syllables', message: '6 syllables, target 5' }] },
      ],
      previousAttempts: new Map(),
    });
    expect(prompt).toContain('REWRITE ONLY');
    expect(prompt).toContain('Line 2');
    expect(prompt).toMatch(/keep[^\n]*verbatim/i);
  });

  it('includes prior attempts when provided', () => {
    const prior = new Map<number, string[]>([[1, ['previous bad attempt']]]);
    const prompt = buildRevisionPrompt({
      phrases: [fixturePhrase('p1', 5), fixturePhrase('p2', 5)],
      locks: [],
      sectionLabels: ['Verse 1', 'Verse 1'],
      context: fixtureContext,
      currentLines: ['line one', 'line two'],
      validations: [
        { index: 0, text: 'line one', passed: true, failures: [] },
        { index: 1, text: 'line two', passed: false, failures: [{ type: 'syllables', message: 'short' }] },
      ],
      previousAttempts: prior,
    });
    expect(prompt).toContain('previous bad attempt');
    expect(prompt).toMatch(/different direction/i);
  });
});
```

The `locks: []` is intentional — `buildPrompt` tolerates a sparse locks array because it indexes `locks[index]` and only acts on truthy entries.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/prompt.test.ts`
Expected: FAIL — `buildRevisionPrompt` not exported.

- [ ] **Step 3: Implement `buildRevisionPrompt` in `src/prompt.ts`**

First, extend the existing types import at the top of `src/prompt.ts` from:

```ts
import type { LyricsContext, Phrase, PhraseLockState } from './types';
```

to:

```ts
import type { LineValidation, LyricsContext, Phrase, PhraseLockState } from './types';
```

Then append at the end of the file:

```ts
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
```

- [ ] **Step 4: Run all prompt tests**

Run: `npx vitest run src/prompt.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompt.ts src/prompt.test.ts
git commit -m "Add buildRevisionPrompt with failing-line markers and prior attempts"
```

---

## Task 15: Agent controller — initial generation only

**Files:**
- Create: `src/agent.ts`
- Test: `src/agent.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { runPipeline } from './agent';
import type { LyricsContext, Phrase, PhraseLockState, PipelineInput } from './types';
import { parseLockInput } from './locks';

const ctx: LyricsContext = {
  theme: '', mood: '', genre: '', pov: '', otherNotes: '',
  mustInclude: '', avoid: '', rhymeScheme: 'SECTION', strictSyllables: true,
};

const phrase = (syllables: number, id = 'p'): Phrase => ({
  id, notes: [], syllables,
  stressPattern: '', endingDirection: 'level', startTime: 0, endTime: 0,
});

async function consume(gen: AsyncGenerator<unknown, unknown>) {
  const yielded: unknown[] = [];
  let result: unknown;
  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    yielded.push(next.value);
  }
  return { yielded, result };
}

describe('runPipeline initial generation', () => {
  it('yields one iteration when first generation passes', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => '1. one two three\n2. four five six',
    };
    const { yielded, result } = await consume(runPipeline(input));
    expect(yielded).toHaveLength(1);
    const log = result as { finalStatus: string; iterations: unknown[] };
    expect(log.finalStatus).toBe('clean');
    expect(log.iterations).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent.test.ts`
Expected: FAIL — `agent` not found.

- [ ] **Step 3: Implement minimal `runPipeline` in `src/agent.ts`**

```ts
import type {
  Iteration,
  IterationLog,
  LineValidation,
  PipelineInput,
} from './types';
import { buildPrompt } from './prompt';
import { validateLines } from './validators';

const DEFAULT_MAX_ITERATIONS = 3;

function parseLines(raw: string, expected: number): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[\).:-]?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, expected);
}

export async function* runPipeline(
  input: PipelineInput,
): AsyncGenerator<Iteration, IterationLog> {
  const max = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const iterations: Iteration[] = [];

  const initialPrompt = buildPrompt(
    input.phrases,
    input.locks,
    input.context,
    input.sectionLabels,
  );

  let raw: string;
  try {
    raw = await input.llmCall(initialPrompt, input.signal);
  } catch (caught) {
    const log: IterationLog = {
      iterations,
      finalStatus: 'error',
      errorMessage: caught instanceof Error ? caught.message : 'LLM call failed',
    };
    return log;
  }

  const lines = parseLines(raw, input.phrases.length);
  const validations: LineValidation[] = validateLines(
    lines, input.phrases, input.locks, input.sectionLabels, input.context,
  );

  const iteration: Iteration = {
    number: 1,
    kind: 'initial',
    output: lines,
    validations,
    failingIndices: validations.filter((v) => !v.passed).map((v) => v.index),
  };
  iterations.push(iteration);
  yield iteration;

  const finalStatus: IterationLog['finalStatus'] = iteration.failingIndices.length === 0 ? 'clean' : 'capped';
  return { iterations, finalStatus };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts src/agent.test.ts
git commit -m "Add agent runPipeline (initial generation, no revision yet)"
```

---

## Task 16: Agent controller — revision loop

**Files:**
- Modify: `src/agent.ts`
- Modify: `src/agent.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/agent.test.ts`:

```ts
describe('runPipeline revision loop', () => {
  it('runs a revision iteration when the initial output fails', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];

    const responses = [
      '1. one two three four\n2. four five six',
      '1. one two three\n2. four five six',
    ];
    let call = 0;
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => responses[call++] ?? responses[responses.length - 1],
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.iterations).toHaveLength(2);
    expect(log.iterations[1].kind).toBe('revise');
    expect(log.finalStatus).toBe('clean');
  });

  it('caps at maxIterations and reports capped', async () => {
    const phrases = [phrase(3, 'a')];
    const locks: PhraseLockState[] = [parseLockInput('', 0)];
    const sectionLabels = ['Verse 1'];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => '1. way too many syllables in one line',
      maxIterations: 2,
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.iterations).toHaveLength(2);
    expect(log.finalStatus).toBe('capped');
  });

  it('preserves pinned lines verbatim across iterations', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];

    const calls: string[] = [];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map([[0, 'pinned line one']]),
      llmCall: async (prompt) => {
        calls.push(prompt);
        return '1. pinned line one\n2. four five six';
      },
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.iterations[0].output[0]).toBe('pinned line one');
  });
});
```

You will need to also import `IterationLog` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `runPipeline` in `src/agent.ts`**

Replace the body of `runPipeline` with:

```ts
export async function* runPipeline(
  input: PipelineInput,
): AsyncGenerator<Iteration, IterationLog> {
  const max = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const iterations: Iteration[] = [];
  const previousAttempts = new Map<number, string[]>();

  const applyPinned = (lines: string[]): string[] =>
    lines.map((line, index) => input.pinnedLines.get(index) ?? line);

  // Iteration 1: initial generation.
  const initialPrompt = buildPrompt(
    input.phrases, input.locks, input.context, input.sectionLabels,
  );

  let raw: string;
  try {
    raw = await input.llmCall(initialPrompt, input.signal);
  } catch (caught) {
    return errorLog(iterations, caught);
  }

  let lines = applyPinned(parseLines(raw, input.phrases.length));
  let validations = validateLines(lines, input.phrases, input.locks, input.sectionLabels, input.context);
  const initial: Iteration = {
    number: 1,
    kind: 'initial',
    output: lines,
    validations,
    failingIndices: validations.filter((v) => !v.passed).map((v) => v.index),
  };
  iterations.push(initial);
  yield initial;

  // Revision iterations.
  while (iterations.length < max && initial.failingIndices.length > 0) {
    const last = iterations[iterations.length - 1];
    if (last.failingIndices.length === 0) break;

    last.failingIndices.forEach((index) => {
      const text = last.output[index];
      const list = previousAttempts.get(index) ?? [];
      list.push(text);
      previousAttempts.set(index, list);
    });

    const revisionPrompt = buildRevisionPrompt({
      phrases: input.phrases,
      locks: input.locks,
      sectionLabels: input.sectionLabels,
      context: input.context,
      currentLines: last.output,
      validations: last.validations,
      previousAttempts,
    });

    let nextRaw: string;
    try {
      nextRaw = await input.llmCall(revisionPrompt, input.signal);
    } catch (caught) {
      return errorLog(iterations, caught);
    }

    const nextLines = applyPinned(parseLines(nextRaw, input.phrases.length));
    // Replace only the lines that were failing; keep others from previous iteration.
    const merged = nextLines.map((line, index) =>
      last.failingIndices.includes(index) ? line : last.output[index],
    );
    const nextValidations = validateLines(merged, input.phrases, input.locks, input.sectionLabels, input.context);
    const next: Iteration = {
      number: iterations.length + 1,
      kind: 'revise',
      output: merged,
      validations: nextValidations,
      failingIndices: nextValidations.filter((v) => !v.passed).map((v) => v.index),
    };
    iterations.push(next);
    yield next;

    if (next.failingIndices.length === 0) {
      return { iterations, finalStatus: 'clean' };
    }
  }

  const finalIteration = iterations[iterations.length - 1];
  return {
    iterations,
    finalStatus: finalIteration.failingIndices.length === 0 ? 'clean' : 'capped',
  };
}

function errorLog(iterations: Iteration[], caught: unknown): IterationLog {
  return {
    iterations,
    finalStatus: 'error',
    errorMessage: caught instanceof Error ? caught.message : 'LLM call failed',
  };
}
```

Add `import { buildPrompt, buildRevisionPrompt } from './prompt';` at the top.

- [ ] **Step 4: Run all agent tests**

Run: `npx vitest run src/agent.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts src/agent.test.ts
git commit -m "Add revision loop with prior-attempt context, cap, and pinned lines"
```

---

## Task 17: Agent controller — abort signal

**Files:**
- Modify: `src/agent.ts`
- Modify: `src/agent.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/agent.test.ts`:

```ts
describe('runPipeline abort', () => {
  it('returns error status when llmCall throws AbortError', async () => {
    const phrases = [phrase(3, 'a')];
    const locks: PhraseLockState[] = [parseLockInput('', 0)];
    const sectionLabels = ['Verse 1'];
    const controller = new AbortController();
    controller.abort();
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async (_prompt, signal) => {
        if (signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return '';
      },
      signal: controller.signal,
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.finalStatus).toBe('error');
    expect(log.errorMessage).toContain('aborted');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (abort path already implemented)**

Run: `npx vitest run src/agent.test.ts`
Expected: PASS — Task 16's `errorLog` path covers this.

If it fails for any reason, the most likely cause is that `parseLines` on an empty string yields zero lines and `validateLines` then runs anyway. Add an early guard in `runPipeline` if needed:

```ts
if (input.signal?.aborted) {
  return { iterations, finalStatus: 'error', errorMessage: 'aborted' };
}
```

at the top of the function.

- [ ] **Step 3: Commit**

```bash
git add src/agent.ts src/agent.test.ts
git commit -m "Add abort-signal regression test for pipeline"
```

---

## Task 18: App.tsx — wire pipeline into Generate button

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Extend `GeneratedLine` to carry validation**

In `src/types.ts`, replace `GeneratedLine` with:

```ts
export type GeneratedLine = {
  text: string;
  locked: boolean;
  validation: LineValidation | null;
};
```

(Remove the old `invalid` and `validationMessage` fields — they're now derived from `validation`.)

- [ ] **Step 2: Add `IterationLog` state to `App.tsx`**

Near the other `useState` calls in `App` (around line 205), add:

```tsx
const [iterationLog, setIterationLog] = useState<IterationLog>({ iterations: [], finalStatus: 'idle' });
```

Also import `IterationLog`, `LineValidation` from `./types`, and `runPipeline` from `./agent`.

- [ ] **Step 3: Replace `generateLyrics` body**

Replace the existing `generateLyrics` function with:

```tsx
async function generateLyrics() {
  if (!apiKey.trim()) {
    setError(`Add a ${providerLabel(llmProvider)} API key to generate in-tool, or use Copy prompt.`);
    return;
  }
  if (modelForProvider(llmProvider) === CUSTOM_MODEL && !customModel.trim()) {
    setError('Enter a custom model ID, or choose a curated model from the dropdown.');
    return;
  }

  setIsGenerating(true);
  setError('');
  setIterationLog({ iterations: [], finalStatus: 'idle' });
  abortRef.current = new AbortController();

  const pinnedLines = new Map<number, string>();
  output.forEach((line, index) => {
    if (line.locked) pinnedLines.set(index, line.text);
  });

  const llmCall = (promptText: string, signal?: AbortSignal) =>
    generateForProvider(llmProvider, promptText, apiKey.trim(), signal);

  try {
    const generator = runPipeline({
      phrases,
      locks: effectiveLocks,
      sectionLabels,
      context,
      pinnedLines,
      llmCall,
      signal: abortRef.current.signal,
    });

    let log: IterationLog | undefined;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        log = next.value;
        break;
      }
      setIterationLog((existing) => ({
        ...existing,
        iterations: [...existing.iterations, next.value],
      }));
    }

    if (log) {
      setIterationLog(log);
      const final = log.iterations[log.iterations.length - 1];
      if (final) {
        setOutput(final.output.map((text, index) => ({
          text,
          locked: pinnedLines.has(index),
          validation: final.validations[index] ?? null,
        })));
      }
      if (log.finalStatus === 'error') setError(log.errorMessage ?? 'Generation failed.');
    }
  } catch (caught) {
    if ((caught as Error).name !== 'AbortError') {
      setError(caught instanceof Error ? caught.message : 'Generation failed.');
    }
  } finally {
    setIsGenerating(false);
    abortRef.current = null;
  }
}
```

- [ ] **Step 4: Update `output` rendering to read from `validation`**

In the output panel (around line 770), replace:

```tsx
<div key={`${index}-${line.text}`} className={`output-line ${line.invalid ? 'invalid' : ''}`}>
```

with:

```tsx
<div key={`${index}-${line.text}`} className={`output-line ${line.validation && !line.validation.passed ? 'invalid' : ''}`}>
```

And replace the `{line.invalid && <small>{line.validationMessage}</small>}` line with:

```tsx
{line.validation && !line.validation.passed && (
  <small>{line.validation.failures.map((f) => f.message).join('; ')}</small>
)}
```

- [ ] **Step 5: Update other places that construct `GeneratedLine`**

Search for any remaining `invalid:` or `validationMessage:` literal usages and replace them. The earlier `setOutput(lines.map(...))` block in the old `generateLyrics` is gone, but check for stray references.

- [ ] **Step 6: Type-check and run all tests**

```
npx tsc --noEmit
npm test
```

Expected: all green.

- [ ] **Step 7: Manual smoke test**

```
npm run dev
```

Open `http://127.0.0.1:5173/`, upload a small MIDI, fill an API key, click Generate. The output panel should populate. Iteration log UI is not yet wired (next task) — for now you should at least see lyrics appear.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/types.ts
git commit -m "Wire agentic pipeline into Generate button"
```

---

## Task 19: App.tsx — iteration log UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add component above `App` in `App.tsx`**

Just below the existing `InfoLabel` component definition, add:

```tsx
function IterationLogPanel({ log }: { log: IterationLog }) {
  const [expanded, setExpanded] = useState(true);
  if (log.iterations.length === 0 && log.finalStatus === 'idle') return null;

  return (
    <div className="iteration-log">
      <button type="button" className="iteration-log-header" onClick={() => setExpanded(!expanded)}>
        <span>Iteration log</span>
        <span className="mono">{log.iterations.length} iter · {log.finalStatus}</span>
      </button>
      {expanded && (
        <div className="iteration-log-body">
          {log.iterations.map((iteration) => {
            const passed = iteration.validations.filter((v) => v.passed).length;
            const total = iteration.validations.length;
            return (
              <div key={iteration.number} className="iteration-entry">
                <strong>Iter {iteration.number} · {iteration.kind} · {passed}/{total} passed</strong>
                {iteration.failingIndices.map((index) => {
                  const validation = iteration.validations[index];
                  return (
                    <div key={index} className="iteration-failure">
                      Line {index + 1} — {validation.failures.map((f) => f.message).join('; ')}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {log.finalStatus === 'capped' && <p className="iteration-final">Stopped: hit iteration cap with unresolved lines.</p>}
          {log.finalStatus === 'clean' && <p className="iteration-final">Stopped: clean.</p>}
          {log.finalStatus === 'error' && <p className="iteration-final">Stopped: {log.errorMessage}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render `<IterationLogPanel log={iterationLog} />` in the App layout**

Insert it directly after the `<pre className="prompt-box">{prompt}</pre>` block, inside the same right-side panel.

- [ ] **Step 3: Add styles to `src/styles.css`**

Append:

```css
.iteration-log {
  margin: 12px 0;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: #161616;
}
.iteration-log-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  color: #ffb6c1;
  border: 0;
  font-weight: 600;
  cursor: pointer;
}
.iteration-log-body {
  padding: 6px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.iteration-entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.92em;
  color: #d8d8d8;
}
.iteration-failure {
  color: #f5d36a;
  padding-left: 12px;
  font-size: 0.9em;
}
.iteration-final {
  color: #9aa0a6;
  font-style: italic;
  margin: 0;
}
```

- [ ] **Step 4: Manual verification**

```
npm run dev
```

Generate lyrics with an intentional issue (e.g., set a 1-syllable target with locked content of 5 syllables). Confirm the iteration log shows iter 1 with failures, iter 2 trying again, etc.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Add iteration log panel (default expanded)"
```

---

## Task 20: App.tsx — per-line status badges

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add a status badge to each output line**

In the output panel JSX, just before the `<input>` for each line, add:

```tsx
{line.validation && (
  <span
    className={`line-badge ${line.validation.passed ? 'pass' : 'warn'}`}
    title={line.validation.failures.map((f) => f.message).join('; ') || 'passed'}
  >
    {line.validation.passed ? '✓' : '!'}
  </span>
)}
```

Also import any icons you want from `lucide-react` if you'd rather use `Check` / `AlertTriangle` than text. Text is fine for v1.

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
.line-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.85em;
  margin-right: 8px;
}
.line-badge.pass {
  background: #1f3a1f;
  color: #6cd76c;
}
.line-badge.warn {
  background: #3a2f1f;
  color: #f5d36a;
}
```

- [ ] **Step 3: Manual verification**

Generate lyrics. Each output line should show ✓ or ! based on its validation status, with a tooltip showing the failure reasons.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Add per-line pass/warn badges in output panel"
```

---

## Task 21: App.tsx — auto-detect section labels at upload

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Use `detectSections` instead of `defaultSectionLabels`**

Add `import { detectSections } from './structure';` at the top of `App.tsx`.

In `handleFile`, replace:

```tsx
setSectionLabels(defaultSectionLabels(analyzed.length));
```

with:

```tsx
setSectionLabels(detectSections(analyzed));
```

- [ ] **Step 2: Manual verification**

Upload a MIDI with a clearly repeating chorus. The phrase rows should now show `Chorus 1` / `Chorus 2` automatically instead of `Verse 1` everywhere. Manual changes via the section marker UI should still override.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Auto-detect sections from melodic repetition at upload"
```

---

## Task 22: App.tsx — section recurrence hint

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/structure.ts`

- [ ] **Step 1: Export a clusters helper from `src/structure.ts`**

Append:

```ts
export function detectClusters(phrases: Phrase[]): number[] {
  if (phrases.length === 0) return [];
  const clusterId = new Array(phrases.length).fill(-1);
  let next = 0;
  for (let i = 0; i < phrases.length; i += 1) {
    if (clusterId[i] !== -1) continue;
    clusterId[i] = next;
    for (let j = i + 1; j < phrases.length; j += 1) {
      if (clusterId[j] !== -1) continue;
      if (phraseSimilarity(phrases[i], phrases[j]) >= SIMILARITY_THRESHOLD) {
        clusterId[j] = next;
      }
    }
    next += 1;
  }
  return clusterId;
}
```

(You can refactor `detectSections` to call `detectClusters` to avoid duplication.)

- [ ] **Step 2: Track clusters and surface the hint**

In `App.tsx`, derive clusters once via `useMemo`:

```tsx
const phraseClusters = useMemo(() => detectClusters(phrases), [phrases]);
```

Add state for the hint:

```tsx
const [recurrenceHint, setRecurrenceHint] = useState<{ startIndex: number; targets: number[]; label: string } | null>(null);
```

Wrap `handleSectionMarkerChange` so that when a marker change happens, the function computes which sibling phrases share a cluster but a different label, and offers to apply the change to them too:

```tsx
function handleSectionMarkerChange(startIndex: number, value: string) {
  setSectionLabels((existing) => {
    const synced = syncSectionLabels(existing, phrases.length);
    const endIndex = sectionEndIndex(synced, startIndex, phrases.length);
    const next = synced.map((label, index) =>
      index >= startIndex && index < endIndex ? value : label,
    );

    const clusterId = phraseClusters[startIndex];
    if (clusterId !== undefined) {
      const targets = phraseClusters
        .map((id, index) => ({ id, index }))
        .filter(({ id, index }) =>
          id === clusterId
          && (index < startIndex || index >= endIndex)
          && next[index] !== value,
        )
        .map(({ index }) => index);
      if (targets.length > 0) {
        setRecurrenceHint({ startIndex, targets, label: value });
      } else {
        setRecurrenceHint(null);
      }
    }

    return next;
  });
}
```

- [ ] **Step 3: Render the hint banner**

Above the phrase list, render:

```tsx
{recurrenceHint && (
  <div className="recurrence-hint">
    <span>
      Phrase{recurrenceHint.targets.length > 1 ? 's' : ''}{' '}
      {recurrenceHint.targets.map((t) => t + 1).join(', ')} share this melody — apply <strong>{recurrenceHint.label}</strong> there too?
    </span>
    <button type="button" onClick={() => {
      setSectionLabels((existing) => existing.map((label, index) =>
        recurrenceHint.targets.includes(index) ? recurrenceHint.label : label,
      ));
      setRecurrenceHint(null);
    }}>Apply</button>
    <button type="button" className="ghost" onClick={() => setRecurrenceHint(null)}>Dismiss</button>
  </div>
)}
```

- [ ] **Step 4: Add styles**

Append to `src/styles.css`:

```css
.recurrence-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1f1f2a;
  border: 1px solid #2a2a40;
  border-radius: 8px;
  padding: 10px 14px;
  margin: 8px 0;
}
.recurrence-hint button { font-size: 0.9em; }
```

- [ ] **Step 5: Manual verification**

Load a MIDI with two phrases that are melodically similar but auto-labeled differently. Change one label. Verify the hint banner appears with Apply / Dismiss.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/structure.ts src/styles.css
git commit -m "Surface 'apply same section label to recurring melody' hint"
```

---

## Task 23: App.tsx — Revise rest button

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a `Revise rest` button next to existing output controls**

Inside the output panel header (`<div className="button-row">` around line 762), add:

```tsx
<button
  type="button"
  className="ghost small"
  disabled={!canGenerate || output.length === 0}
  onClick={generateLyrics}
>
  Revise rest
</button>
```

This works because `generateLyrics` already pins all currently-locked output lines via `pinnedLines`. Pressing the button while locked lines exist re-runs the loop on the unlocked positions only.

- [ ] **Step 2: Manual verification**

1. Generate a draft.
2. Lock one line (click the lock icon).
3. Click `Revise rest`.
4. Confirm the locked line stays unchanged across iterations and the others are rewritten.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "Add Revise rest button (re-runs pipeline with locked lines pinned)"
```

---

## Task 24: Final regression pass

**Files:** none

- [ ] **Step 1: Run full test suite**

```
npm test
```

Expected: all green.

- [ ] **Step 2: Run type-check and build**

```
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: End-to-end manual smoke**

```
npm run dev
```

1. Upload a MIDI.
2. Confirm sections look reasonable (no manual edits needed for a clean test file).
3. Click Generate. Watch the iteration log expand and update.
4. Confirm output lines have green/yellow badges.
5. Lock one line, click `Revise rest`, confirm the locked line is preserved.
6. Try a strict-mismatch scenario (lock content longer than the line) and confirm Generate is disabled.

- [ ] **Step 4: Commit any final polish**

If you adjusted styles or copy during the smoke test, commit them. If everything was clean, no commit needed.

---

## Self-Review

**Spec coverage:**
- Stage 0 structural analysis (auto-segment + section detection): Tasks 11, 12, 13, 21
- Stage 1 initial generation: Task 15
- Stage 2 validation: Tasks 3–10 (vowels + 6 validators + aggregator)
- Stage 3 targeted revision: Task 14 (revision prompt) + Task 16 (loop)
- Stop conditions / abort: Tasks 16, 17
- Data shapes & orchestrator API: Task 1 + Task 15 (initial signature) + Task 16 (full)
- UX changes:
  - Iteration log expanded by default: Task 19
  - Per-line status badges: Task 20
  - Auto chip on phrase rows: NOT YET COVERED — see note below
  - Section recurrence hint: Task 22
  - Revise rest button: Task 23
  - Generate button progressive states: covered implicitly by `isGenerating` plus iteration log updates; if the user wants the button label to change beyond "Generating", that's a follow-up
- File structure: matches spec (new files: vowels, validators, structure, agent + tests; modified: types, prompt, prosody, App, styles)

**Gap to fix inline:** the spec calls for an `auto`/`manual` chip on phrase rows tracking whether the boundary was decided by auto-segmentation or manual edit. The current task list does not cover this. Adding Task 21.5 below.

---

## Task 21.5: Phrase-origin chip

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PhraseRow.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Track origin state in `App.tsx`**

Add state:

```tsx
const [phraseOrigins, setPhraseOrigins] = useState<PhraseOrigin[]>([]);
```

(Import `PhraseOrigin` from `./types`.)

In `handleFile`, after `setPhrases(analyzed)`, set:

```tsx
setPhraseOrigins(analyzed.map(() => 'auto'));
```

In `updatePhrases`, when called from `handleSplit` or `handleMerge`, mark the affected positions as `'manual'`:

```tsx
function updatePhrases(nextPhrases: Phrase[], nextSectionLabels?: string[], nextOrigins?: PhraseOrigin[]) {
  setPhrases(nextPhrases);
  setLocks((existing) => nextPhrases.map((_, index) => existing[index] ?? parseLockInput('', index)));
  setSectionLabels((existing) => syncSectionLabels(nextSectionLabels ?? existing, nextPhrases.length));
  setPhraseOrigins(nextOrigins ?? nextPhrases.map(() => 'manual'));
}
```

Update `handleSplit` and `handleMerge` to pass `phrases.map(() => 'manual')`.

- [ ] **Step 2: Pass `origin` to `PhraseRow`**

Add a `origin: PhraseOrigin` prop to `PhraseRow`. Render a small chip in the header:

```tsx
<span className={`origin-chip ${origin}`}>{origin}</span>
```

In `App.tsx`, pass `phraseOrigins[index] ?? 'auto'` to each `<PhraseRow ... />`.

- [ ] **Step 3: Style the chip**

Append to `src/styles.css`:

```css
.origin-chip {
  display: inline-block;
  font-size: 0.7em;
  padding: 2px 6px;
  border-radius: 999px;
  margin-left: 6px;
  text-transform: lowercase;
  letter-spacing: 0.04em;
}
.origin-chip.auto { background: #1f3a3a; color: #79d3d3; }
.origin-chip.manual { background: #3a1f3a; color: #d379d3; }
```

- [ ] **Step 4: Manual verification**

Upload a MIDI. All chips show `auto`. Click a note to split a phrase. The affected phrase's chip becomes `manual`. Merge it back — still `manual` (we don't auto-revert).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/PhraseRow.tsx src/styles.css
git commit -m "Add auto/manual origin chip on phrase rows"
```

---

## Execution

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-agentic-lyric-pipeline.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
