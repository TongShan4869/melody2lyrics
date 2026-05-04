# Prosody Singability Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add XAI-Lyricist's length-axis prosody alignment to the lyric pipeline: per-note `L`/`S` classification, compound `<strong,long>` prompt template, curated singability knowledge, and a length-alignment validator.

**Architecture:** Four self-contained changes that compose. Task 1 adds the data foundation (`length` on `AnalyzedNote`). Task 2 surfaces it in the LLM prompt as compound tokens plus a small principles block. Task 3 saves human-facing knowledge to a markdown file. Task 4 enforces the principle at the line ending via a new validator that hooks into the existing `validateLines` pipeline.

**Tech Stack:** TypeScript, Vite, vitest, React 18. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-02-prosody-singability-design.md`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/types.ts` | modify | Add `length: 'L'\|'S'` to `AnalyzedNote`; add `'length-alignment'` to `ValidationFailureType` |
| `src/prosody.ts` | modify | Compute `length` per note in `analyzePhraseNotes` |
| `src/prosody.test.ts` | modify | Tests for length classification |
| `src/structure.test.ts` | modify | Update `makeNote` factory to set `length` |
| `src/validators.test.ts` | modify | Update `note()` factory to set `length`; tests for new validator |
| `src/prompt.ts` | modify | `compoundProsody()` helper; replace per-line `stress`/`rhythm` with `prosody = <strong,long>-...`; add `PROSODY PRINCIPLES` block |
| `src/prompt.test.ts` | modify | Update fixtures to set `length`; update assertion for new header; assert principles block |
| `src/validators.ts` | modify | Add `lengthAlignmentValidator`; wire into `validateLines` |
| `docs/knowledge/singability.md` | create | Curated knowledge base — XAI-Lyricist alignment principles |
| `CLAUDE.md` | modify | Add reference doc lines for new spec, plan, knowledge file |

---

## Task 0: Branch setup

**Files:** none (workspace-only change)

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b prosody-singability
git status -sb
```

Expected: `## prosody-singability` (no upstream yet).

---

## Task 1: Note length classification

**Files:**
- Modify: `src/types.ts`
- Modify: `src/prosody.ts:79-99`
- Modify: `src/prosody.test.ts`
- Modify: `src/structure.test.ts:5-14`
- Modify: `src/validators.test.ts:121-124`
- Modify: `src/prompt.test.ts:19-23`

- [ ] **Step 1: Write the failing tests**

Add to `src/prosody.test.ts`, inside the existing `describe('prosody analysis', ...)` block:

```ts
it('marks notes longer than the phrase mean as L', () => {
  const phrases = analyzeNotes([
    note(1, 0, 0.2),
    note(2, 0.2, 0.2),
    note(3, 0.4, 1.0),
    note(4, 1.4, 0.2),
  ]);
  expect(phrases[0].notes.map((n) => n.length).join('')).toBe('SSLS');
});

it('marks all-equal-duration notes as S (none exceeds the mean)', () => {
  const phrases = analyzeNotes([
    note(1, 0, 0.5),
    note(2, 0.5, 0.5),
    note(3, 1.0, 0.5),
  ]);
  expect(phrases[0].notes.every((n) => n.length === 'S')).toBe(true);
});

it('marks a single-note phrase as S', () => {
  const phrases = analyzeNotes([note(1, 0, 0.5)]);
  expect(phrases[0].notes[0].length).toBe('S');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/prosody.test.ts`
Expected: 3 new tests fail with TS error (`Property 'length' does not exist on type 'AnalyzedNote'`) — which prevents the suite from running. That's the correct failure mode for this step. Move on.

- [ ] **Step 3: Add `length` to `AnalyzedNote`**

In `src/types.ts`, modify the `AnalyzedNote` type:

```ts
export type AnalyzedNote = Note & {
  stressScore: number;
  stress: 'S' | 'w';
  length: 'L' | 'S';
};
```

- [ ] **Step 4: Compute `length` in `prosody.ts`**

In `src/prosody.ts`, replace `analyzePhraseNotes` (lines 79–99) with:

```ts
function analyzePhraseNotes(notes: Note[], beat: number): AnalyzedNote[] {
  if (notes.length === 0) return [];

  const phraseStart = notes[0];
  const meanDuration = notes.reduce((sum, n) => sum + n.duration, 0) / notes.length;

  const analyzed = notes.map((note): AnalyzedNote => {
    const stressScore = metricStress(note, phraseStart, beat);
    return {
      ...note,
      stressScore,
      stress: stressScore >= STRONG_STRESS_THRESHOLD ? 'S' : 'w',
      length: note.duration > meanDuration ? 'L' : 'S',
    };
  });

  if (analyzed.some((note) => note.stress === 'S')) return analyzed;

  const anchor = analyzed.reduce((best, note) => (note.stressScore > best.stressScore ? note : best), analyzed[0]);
  return analyzed.map((note): AnalyzedNote => ({
    ...note,
    stress: note === anchor ? 'S' : 'w',
  }));
}
```

(`length` is preserved through the spread in the anchor branch.)

- [ ] **Step 5: Update `structure.test.ts` factory**

In `src/structure.test.ts`, replace the `makeNote` factory (lines 5–14):

```ts
const makeNote = (midi: number, duration: number): AnalyzedNote => ({
  id: `${midi}-${duration}`,
  midi,
  pitch: 'C4',
  time: 0,
  duration,
  velocity: 0.8,
  stressScore: 0.5,
  stress: 'w',
  length: 'S',
});
```

- [ ] **Step 6: Update `validators.test.ts` factory**

In `src/validators.test.ts`, replace the `note` factory (lines 121–124):

```ts
const note = (duration: number): import('./types').AnalyzedNote => ({
  id: 'n', midi: 60, pitch: 'C4', time: 0, duration, velocity: 0.8,
  stressScore: 0.5, stress: 'w', length: 'S',
});
```

- [ ] **Step 7: Update `prompt.test.ts` fixture**

In `src/prompt.test.ts`, replace the inline notes (lines 20–22) with:

```ts
    { id: 'n1', midi: 60, pitch: 'C4', time: 0, duration: 0.2, velocity: 0.8, stressScore: 1, stress: 'S', length: 'S' },
    { id: 'n2', midi: 62, pitch: 'D4', time: 0.2, duration: 0.2, velocity: 0.8, stressScore: 0.4, stress: 'w', length: 'S' },
    { id: 'n3', midi: 64, pitch: 'E4', time: 0.4, duration: 0.5, velocity: 0.8, stressScore: 0.4, stress: 'w', length: 'L' },
```

(The third note's 0.5s duration > mean of (0.2 + 0.2 + 0.5)/3 = 0.3s, so it is `'L'`. The other two are `'S'`.)

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/prosody.ts src/prosody.test.ts src/structure.test.ts src/validators.test.ts src/prompt.test.ts
git commit -m "$(cat <<'EOF'
Add per-note length classification to AnalyzedNote

Marks each note as 'L' (duration > phrase mean) or 'S' otherwise,
following the XAI-Lyricist definition. Enables length-axis prosody
alignment in the prompt and validators in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Compound prosody template + principles block in prompt

**Files:**
- Modify: `src/prompt.ts`
- Modify: `src/prompt.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/prompt.test.ts`, replace the existing `'includes lyric quality guardrails ...'` test's third assertion (`expect(prompt).toContain('rhythm = short-short-held');`) with:

```ts
    expect(prompt).toContain('prosody = <strong,short>-<weak,short>-<weak,long>');
```

Then add a new test inside the same `describe('prompt builder', ...)` block:

```ts
it('includes the prosody principles block', () => {
  const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);

  expect(prompt).toContain('PROSODY PRINCIPLES (singability)');
  expect(prompt).toContain('Strength alignment');
  expect(prompt).toContain('Length alignment');
  expect(prompt).toContain('<strong/weak,long/short>');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/prompt.test.ts`
Expected: the modified test fails on the new `prosody =` assertion; the new test fails because `PROSODY PRINCIPLES` isn't in the prompt.

- [ ] **Step 3: Add `compoundProsody` helper to `prompt.ts`**

In `src/prompt.ts`, add the export at module scope (place it next to `rhythmProfile`, around line 150):

```ts
export function compoundProsody(phrase: Phrase): string {
  return phrase.notes.map((note) => {
    const strength = note.stress === 'S' ? 'strong' : 'weak';
    const length = note.length === 'L' ? 'long' : 'short';
    return `<${strength},${length}>`;
  }).join('-');
}
```

- [ ] **Step 4: Update the per-line header in `buildPrompt`**

In `src/prompt.ts`, replace the `header` definition inside the `phrases.map` (around line 19-20):

```ts
const prosody = compoundProsody(phrase);
const header = `Line ${index + 1} ${section}${rhyme}- ${phrase.syllables} syllables, prosody = ${prosody}, ends ${phrase.endingDirection}`;
```

(The `rhythm = ...` segment is dropped from the header; `rhythmProfile` stays exported for any future caller.)

- [ ] **Step 5: Insert the principles block**

In `src/prompt.ts`, in the `buildPrompt` return template literal, insert this block between `CREATIVE DIRECTION\n${direction}` and `RHYME PLAN: ${rhymePlan}`:

```ts
PROSODY PRINCIPLES (singability)
1. Strength alignment: place stressed syllables on <strong> notes; unstressed on <weak>.
2. Length alignment: place long syllables (open or held vowels — IPA [ː], or diphthongs like /eɪ/, /aɪ/, /aʊ/, /oʊ/, /ɔɪ/) on <long> notes; short, closed-vowel syllables on <short> notes.
3. Singers can comfortably sustain long vowels and diphthongs; closed-vowel syllables on long notes feel strained.
4. The compound template <strong/weak,long/short> per slot communicates both axes — honor it.
```

The exact block:

```ts
  return `You are writing singable English lyrics to fit an existing melody.

CREATIVE DIRECTION
${direction}

PROSODY PRINCIPLES (singability)
1. Strength alignment: place stressed syllables on <strong> notes; unstressed on <weak>.
2. Length alignment: place long syllables (open or held vowels — IPA [ː], or diphthongs like /eɪ/, /aɪ/, /aʊ/, /oʊ/, /ɔɪ/) on <long> notes; short, closed-vowel syllables on <short> notes.
3. Singers can comfortably sustain long vowels and diphthongs; closed-vowel syllables on long notes feel strained.
4. The compound template <strong/weak,long/short> per slot communicates both axes — honor it.

RHYME PLAN: ${rhymePlan}
- Use rhyme as a section identity, not as repeated filler endings.
- Prefer slant rhyme, internal rhyme, assonance, consonance, and rhythmic echoes over exact repeated end words.

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
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all tests pass, including the modified and new prompt tests.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/prompt.ts src/prompt.test.ts
git commit -m "$(cat <<'EOF'
Use XAI-Lyricist compound prosody template in prompt

Replaces the per-line "stress = S-w-S, rhythm = held-quick-quick" pair
with the compound "prosody = <strong,long>-<weak,short>-..." token used
in the XAI-Lyricist paper, and adds a 4-line PROSODY PRINCIPLES block
explaining strength and length alignment to the LM.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Knowledge base file + CLAUDE.md update

**Files:**
- Create: `docs/knowledge/singability.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create the knowledge file**

Write `docs/knowledge/singability.md`:

```markdown
# Singability — Musical Prosody Knowledge Base

Curated reference for the prosody alignment used by the lyric generator. Source: Liang et al., *XAI-Lyricist: Improving the Singability of AI-Generated Lyrics with Prosody Explanations*, IJCAI-24 (`docs/XAI_LYRICS.pdf`).

## Why singability matters

The XAI-Lyricist human study (n = 14, all musically trained) found that explicit prosody alignment lifts one-trial singing success from 27.1 % (vanilla LM) to 85.7 %. Lyrics that violate prosody force singers to pause, retry, or invent ad-hoc rhythm fixes.

## The two alignment principles

### 1. Strength alignment

| Note side | Syllable side |
|---|---|
| Strong-beat notes (beats 1 and 3 in 4/4) | Stressed syllables (IPA `ˈ`) |
| Weak-beat notes (beats 2 and 4 in 4/4) | Unstressed syllables |

### 2. Length alignment

| Note side | Syllable side |
|---|---|
| Long notes (duration > phrase mean) | Long syllables — IPA `ː` (long vowels) or any diphthong |
| Short notes | Short syllables — pure short vowels, no diphthong |

**Diphthongs** (each is one syllable with two vowel sounds, comfortably sustainable):
- `/eɪ/` — *day, way, stay*
- `/aɪ/` — *sky, fly, mine*
- `/aʊ/` — *down, now, around*
- `/oʊ/` — *slow, road, alone*
- `/ɔɪ/` — *boy, joy*

**Long monophthongs** (IPA `ː`):
- `/iː/` — *see, free, dream*
- `/uː/` — *you, do, blue*
- `/ɑː/` — *far, heart, are*
- `/ɔː/` — *saw, fall, all*

**Short / closed vowels** (don't sustain well on long notes):
- `/ɪ/` (it, this, wish), `/ʊ/` (good, could), `/ʌ/` (love, above), `/ɛ/` (red, said), `/æ/` (sad, back)

## Compound template

XAI-Lyricist combines both axes into one token per slot:

```
<strong,long>  <strong,short>  <weak,long>  <weak,short>
```

A four-syllable line over a melody might be:

```
<strong,long>-<weak,short>-<strong,short>-<weak,long>
```

This is what `buildPrompt` produces under `prosody = …` for each line. The LM sees one compact, unambiguous template per line instead of two separate strings.

## Worked example: "Hey Jude"

(From Figure 1 of the paper.)

| Word | Stress | Length | Note | Reason |
|---|---|---|---|---|
| hey | weak | short | weak-beat short | pickup |
| **JUDE** /dʒuːd/ | strong | long | strong-beat long | beat 1, `/uː/` |
| don't | weak | short | weak-beat short | beat 2 |
| make | weak | short | weak-beat short | beat 2.5 |
| it | weak | short | weak-beat short | beat 3 weak slot |
| **SAD** /sæd/ | strong | short | strong-beat short | beat 4, `/æ/` |

Note that "sad" is *strong* (stressed) but *short* (no long vowel, no diphthong). This is fine — strength and length are independent axes.

## How the codebase uses this knowledge

- `src/prosody.ts` writes `length: 'L' | 'S'` onto each `AnalyzedNote`. The threshold is per-phrase mean duration.
- `src/prompt.ts` `compoundProsody()` emits `<strong,long>` etc. per slot for every line.
- `src/prompt.ts` `buildPrompt()` includes a 4-line `PROSODY PRINCIPLES` block summarizing the rules above.
- `src/validators.ts` `lengthAlignmentValidator` enforces the line-final case: if the last note is long, the last word must end in a long-singable vowel (open or diphthong via `vowels.ts`).

## Citation

```bibtex
@inproceedings{liang2024xailyricist,
  title     = {XAI-Lyricist: Improving the Singability of AI-Generated Lyrics with Prosody Explanations},
  author    = {Liang, Qihao and Ma, Xichu and Doshi-Velez, Finale and Lim, Brian and Wang, Ye},
  booktitle = {Proceedings of the Thirty-Third International Joint Conference on Artificial Intelligence (IJCAI-24)},
  year      = {2024}
}
```
```

- [ ] **Step 2: Update CLAUDE.md reference list**

In `CLAUDE.md`, locate the `## Reference docs` section and replace it with:

```markdown
## Reference docs

- `README.md` — user-facing feature list and lock syntax.
- `docs/melody_lyrics_tool_PRD.md` — full product requirements.
- `docs/superpowers/specs/2026-04-29-agentic-lyric-pipeline-design.md` — design doc for the agentic pipeline.
- `docs/superpowers/plans/2026-04-29-agentic-lyric-pipeline.md` — implementation plan that produced PR #1.
- `docs/superpowers/specs/2026-05-02-prosody-singability-design.md` — design doc for the length-axis prosody upgrade.
- `docs/superpowers/plans/2026-05-02-prosody-singability.md` — implementation plan for the length-axis prosody upgrade.
- `docs/knowledge/singability.md` — curated XAI-Lyricist alignment principles used by the prompt and validators.
- `docs/XAI_LYRICS.pdf` — original XAI-Lyricist paper.
```

- [ ] **Step 3: Commit**

```bash
git add docs/knowledge/singability.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Add singability knowledge base + register new docs in CLAUDE.md

docs/knowledge/singability.md is the human-readable source of truth for
the XAI-Lyricist alignment principles. The prompt's PROSODY PRINCIPLES
block is a condensed version; this file is what contributors read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Length-alignment validator

**Files:**
- Modify: `src/types.ts`
- Modify: `src/validators.ts`
- Modify: `src/validators.test.ts`

- [ ] **Step 1: Write failing tests**

Add this `describe` block to `src/validators.test.ts` (after the existing `heldVowelValidator` block, before `avoidWordsValidator`):

```ts
describe('lengthAlignmentValidator', () => {
  const longTail = (durations: number[]): Phrase => ({
    id: 'p',
    notes: durations.map((d, i) => ({
      id: `n${i}`, midi: 60, pitch: 'C4', time: i, duration: d, velocity: 0.8,
      stressScore: 0.5, stress: 'w', length: i === durations.length - 1 ? 'L' : 'S',
    })),
    syllables: durations.length,
    stressPattern: '',
    endingDirection: 'level',
    startTime: 0,
    endTime: 0,
  });

  const shortTail = (durations: number[]): Phrase => ({
    id: 'p',
    notes: durations.map((d, i) => ({
      id: `n${i}`, midi: 60, pitch: 'C4', time: i, duration: d, velocity: 0.8,
      stressScore: 0.5, stress: 'w', length: 'S',
    })),
    syllables: durations.length,
    stressPattern: '',
    endingDirection: 'level',
    startTime: 0,
    endTime: 0,
  });

  it('fails when long final note carries a closed-vowel word', () => {
    const result = lengthAlignmentValidator('something I find sad', longTail([0.2, 0.2, 0.2, 0.8]));
    expect(result).toEqual({
      type: 'length-alignment',
      message: expect.stringContaining('sad'),
    });
  });

  it('passes when long final note carries an open-vowel word', () => {
    expect(lengthAlignmentValidator('walking far away', longTail([0.2, 0.2, 0.2, 0.8]))).toBeNull();
  });

  it('passes when long final note carries a diphthong word', () => {
    expect(lengthAlignmentValidator('looking at the sky', longTail([0.2, 0.2, 0.2, 0.8]))).toBeNull();
  });

  it('passes when final note is short (no trigger)', () => {
    expect(lengthAlignmentValidator('something I find sad', shortTail([0.2, 0.2, 0.2, 0.2]))).toBeNull();
  });

  it('passes when final word is unknown (skip)', () => {
    expect(lengthAlignmentValidator('whispering xyzzy', longTail([0.2, 0.2, 0.8]))).toBeNull();
  });
});
```

Also update the import at the top of `src/validators.test.ts`:

```ts
import { syllableValidator, lockedWordsValidator, endCollisionValidator, fillerEndingValidator, heldVowelValidator, lengthAlignmentValidator, avoidWordsValidator, validateLines } from './validators';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/validators.test.ts`
Expected: fails with import error (`'lengthAlignmentValidator' is not exported`).

- [ ] **Step 3: Add `'length-alignment'` to the failure-type union**

In `src/types.ts`, modify `ValidationFailureType`:

```ts
export type ValidationFailureType =
  | 'syllables'
  | 'locked-words'
  | 'end-collision'
  | 'filler'
  | 'held-vowel'
  | 'length-alignment'
  | 'avoid';
```

- [ ] **Step 4: Implement the validator**

In `src/validators.ts`, add this function near `heldVowelValidator` (after it, before `avoidWordsValidator`):

```ts
export function lengthAlignmentValidator(
  line: string,
  phrase: Phrase,
): ValidationFailure | null {
  const lastNote = phrase.notes[phrase.notes.length - 1];
  if (!lastNote || lastNote.length !== 'L') return null;
  const word = lastWord(line);
  const vowel = finalVowel(word);
  if (vowel === null) return null;
  if (isOpenVowel(vowel)) return null;
  return {
    type: 'length-alignment',
    message: `final note is long but "${word}" ends in a closed vowel (${vowel})`,
  };
}
```

- [ ] **Step 5: Wire it into `validateLines`**

In `src/validators.ts`, modify `validateLines` to include the new check. After the existing `if (phrase) push(heldVowelValidator(line, phrase));` line, add:

```ts
    if (phrase) push(lengthAlignmentValidator(line, phrase));
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all tests pass, including the 5 new validator tests.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/validators.ts src/validators.test.ts
git commit -m "$(cat <<'EOF'
Add lengthAlignmentValidator for long-final-note singability

Generalizes heldVowelValidator from "held final note" (>=1.75x median)
to "long final note" (length === 'L', i.e. duration > phrase mean) per
the XAI-Lyricist length-alignment principle. Fails when the line-final
word ends in a closed, non-diphthong vowel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: every test passes.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean Vite build.

- [ ] **Step 4: Manual smoke (optional, requires API key)**

In a browser dev server (`npm run dev`), upload a MIDI, generate lyrics, and inspect:
- The piano-roll line shows the correct phrase count.
- Generated line endings on long notes use open-vowel / diphthong words. (One spot check is enough.)
- No regressions on the existing UI flow.

- [ ] **Step 5: Push branch and open PR**

```bash
git push -u origin prosody-singability
gh pr create --title "Add length-axis prosody alignment (XAI-Lyricist)" --body "$(cat <<'EOF'
## Summary
- Adds per-note `length: 'L' | 'S'` classification to `AnalyzedNote` (duration > phrase mean per XAI-Lyricist).
- Replaces per-line `stress` + `rhythm` strings in the prompt with the compound `<strong,long>` template; adds a `PROSODY PRINCIPLES` block.
- Adds `docs/knowledge/singability.md` as the curated alignment knowledge base; registers it in `CLAUDE.md`.
- Adds `lengthAlignmentValidator` for the line-final case (long note + closed-vowel word fails).

## Test plan
- [x] `npm test` — all unit tests pass (3 new prosody, 2 new prompt, 5 new validator).
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` clean.
- [ ] Manual: upload a MIDI, generate, confirm endings on long notes prefer open vowels.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [x] **Spec coverage:**
  - §1 (Data) → Task 1.
  - §2 (Compound template + principles block) → Task 2.
  - §3 (Knowledge base + CLAUDE.md) → Task 3.
  - §4 (lengthAlignmentValidator + new failure type) → Task 4.
- [x] **Placeholder scan:** no TBDs, all code blocks complete.
- [x] **Type consistency:** `length: 'L' | 'S'` used identically in Task 1, 2, 4. `lengthAlignmentValidator` named consistently. `'length-alignment'` failure type matches between `types.ts` and `validators.ts`.
- [x] **Hidden type breakage:** Task 1 explicitly updates all three test factories that construct `AnalyzedNote` (`structure.test.ts`, `validators.test.ts`, `prompt.test.ts`).
