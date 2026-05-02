# Prosody Singability Upgrade — Design

**Date:** 2026-05-02
**Author:** Claude + Tong
**Source:** `docs/XAI_LYRICS.pdf` (Liang et al., *XAI-Lyricist: Improving the Singability of AI-Generated Lyrics with Prosody Explanations*, IJCAI-24)

## Goal

Bring the lyric pipeline closer to XAI-Lyricist's two-axis prosody alignment so generated lyrics are more singable. The current pipeline aligns *strength* (strong/weak beats ↔ stressed/unstressed syllables); it does not explicitly align *length* (long/short notes ↔ long/short syllables) outside a narrow held-final-note check.

## Non-goals

- No model-training work. The improvement is in MIDI analysis, prompt template, validation, and a small in-prompt knowledge block.
- No UI redesign in this iteration. L/S markers in the slot row are deferred.
- No replacement of the existing `S/w` strength axis. The new length axis composes with it.

## Reference: XAI-Lyricist taxonomy

From the paper (§3.2, Table 1):

| Axis | Note side | Syllable side |
|---|---|---|
| **Strength** | strong-beat / weak-beat | stressed (IPA `ˈ`) / unstressed |
| **Length** | long (duration > phrase mean) / short | long (IPA `ː` or diphthong) / short |

Each slot becomes a compound token: `<strong,long>`, `<strong,short>`, `<weak,long>`, `<weak,short>`. The paper's human study reports 85.7 % one-trial singability with this representation vs. 27.1 % for a vanilla LM baseline — the alignment template is what closes the gap.

## Scope

Four changes, in this order:

1. **Data** — per-note length classification on the `AnalyzedNote` type.
2. **Prompt** — compound prosody template per line + curated singability principles block.
3. **Knowledge base** — `docs/knowledge/singability.md` as the human-readable source of truth; the prompt's principles block is a condensed version of it.
4. **Validator** — `lengthAlignmentValidator` that generalizes `heldVowelValidator` to "any long final note".

UI surfacing of the new axis is out of scope.

## Design

### 1. Data: per-note length

**File:** `src/types.ts`, `src/prosody.ts`, `src/prosody.test.ts`

- Extend `AnalyzedNote`:
  ```ts
  export type AnalyzedNote = Note & {
    stressScore: number;
    stress: 'S' | 'w';
    length: 'L' | 'S';      // NEW
  };
  ```
- In `analyzePhraseNotes`, compute the phrase's mean note duration. A note is `'L'` iff `duration > mean`; otherwise `'S'`. This matches the paper's exact definition (§3.2):
  > "we define long notes as those whose duration is greater than the average duration of all notes in a melody phrase, with all non-long notes being short notes."
- Edge case: a phrase with one note has mean = its own duration, so the strict `>` makes it `'S'`. That's acceptable — a one-note phrase has no internal contrast to anchor "long" against.
- The existing `rhythmProfile()` in `prompt.ts` (4-bucket median split) is unchanged. It is a separate, finer-grained signal kept available for human-readable display.

**Tests** (added to `prosody.test.ts`):
- A phrase of `[0.2, 0.2, 1.0, 0.2]` durations marks index 2 as `'L'`, others as `'S'`.
- A phrase of all-equal durations marks all notes as `'S'` (none exceeds the mean).
- A one-note phrase marks that note as `'S'`.
- The existing metric-stress regression tests still pass — `length` is additive.

### 2. Prompt: compound template + principles block

**File:** `src/prompt.ts`, `src/prompt.test.ts`

**Compound template.** In `buildPrompt`, replace the per-line header
```
- N syllables, stress = S-w-S, rhythm = held-quick-quick, ends rising
```
with
```
- N syllables, prosody = <strong,long>-<weak,short>-<weak,short>, ends rising
```

`<strong>` ↔ `S`, `<weak>` ↔ `w`, `<long>` ↔ `L`, `<short>` ↔ `S`. A small helper `compoundProsody(phrase): string` produces this string.

The human-readable `rhythmProfile()` is dropped from the line header (it duplicates the new length axis at lower fidelity), but the function stays exported for any future UI use.

**Principles block.** Add a `PROSODY PRINCIPLES` section near the top of the prompt (after `CREATIVE DIRECTION`, before `RHYME PLAN`):
```
PROSODY PRINCIPLES (singability)
1. Strength alignment: place stressed syllables on <strong> notes; unstressed on <weak>.
2. Length alignment: place long syllables (open or held vowels — IPA [ː], or diphthongs like /eɪ/, /aɪ/, /aʊ/, /oʊ/, /ɔɪ/) on <long> notes; short, closed-vowel syllables on <short> notes.
3. Singers can comfortably sustain long vowels and diphthongs; closed-vowel syllables on long notes feel strained.
4. The compound template <strong/weak,long/short> per slot communicates both axes — honor it.
```

This is a **soft directive**, embedded once per prompt. Total budget: ~6 lines / ~80 tokens.

**Tests** (added to `prompt.test.ts`):
- A simple two-phrase example produces the new `prosody = <strong,long>-...` line and the `PROSODY PRINCIPLES` block.
- Snapshot the principles text so future edits to it are intentional.

### 3. Knowledge base

**File:** `docs/knowledge/singability.md` (new)

A ~50-line markdown reference distilled from the paper:
- Why singability matters (humans take 1.5× longer to sing unsingable lyrics, per the human study).
- Strength alignment definition + worked example.
- Length alignment definition + IPA examples (Jude /dʒuːd/ long; sad /sæd/ short; down /daʊn/ long via diphthong).
- The compound template.
- Citation block (BibTeX-style).

The 4-line `PROSODY PRINCIPLES` prompt block is a manually condensed version. They diverge on purpose: the markdown file is for humans contributing to the codebase; the prompt block is for the LM. If the principles text in `prompt.ts` ever drifts from the markdown, the markdown is authoritative.

`CLAUDE.md`'s "Reference docs" list gets a new line pointing at the file.

### 4. Validator: `lengthAlignmentValidator`

**File:** `src/validators.ts`, `src/vowels.ts`, `src/validators.test.ts`, `src/types.ts`

**Behavior** (option C from brainstorming):
- Trigger only when the **line-final note has `length === 'L'`**.
- Fail iff the line's final word ends in a closed, non-diphthong vowel — same lookup `heldVowelValidator` already uses (`finalVowel(word)` + `isOpenVowel`).
- Failure message: `final note is long but "<word>" ends in a closed vowel (<VOWEL>)`. Failure type: `'length-alignment'`.
- Hard fail: included in `validateLines`, contributes to revision iterations.

**Relationship to `heldVowelValidator`:**
- `heldVowelValidator` triggers on "final note duration ≥ 1.75 × median" (a stricter, sustain-focused threshold).
- `lengthAlignmentValidator` triggers on "final note `length === 'L'`" (any duration above phrase mean — the paper's threshold).
- They overlap but don't conflict; both contribute to better singability. **Decision: keep both.** Removing `heldVowelValidator` would lose the held-final-note focus that the existing PRD calls out. They produce different failure types so the user can tell them apart.

**Vocabulary expansion:** to reduce false positives we extend `vowels.ts` `FINAL_VOWELS` only as needed for tests; long-term the lookup remains heuristic and not authoritative.

**Tests** (added to `validators.test.ts`):
- Long final note + closed-vowel word ("sad" on a `<long>`) → fails.
- Long final note + open-vowel word ("Jude") → passes.
- Short final note + closed-vowel word ("sad") → passes (no trigger).
- Word not in lookup → passes (no trigger; same convention as `heldVowelValidator`).

**Type addition:**
```ts
export type ValidationFailureType =
  | 'syllables' | 'locked-words' | 'end-collision'
  | 'filler' | 'held-vowel' | 'length-alignment'  // NEW
  | 'avoid';
```

## Data flow (changes only)

```
midi.ts → prosody.ts (now also writes note.length: L/S)
       ↓
prompt.ts buildPrompt:
  - PROSODY PRINCIPLES block (new)
  - per-line: prosody = <strong,long>-<weak,short>-... (new)
       ↓
LLM
       ↓
validators.ts validateLines:
  - + lengthAlignmentValidator (new)
       ↓
agent.ts runPipeline (unchanged — picks up the new validator automatically)
```

## Out of scope (deferred)

- L/S badges in the slot row UI.
- IPA-aware syllable-internal long-vowel detection (current vowel lookup is final-syllable only; sufficient for the line-ending validator).
- A "Singability score" UI metric (paper's prosody-BLEU). Could be a follow-up.

## Risks / mitigations

- **Risk:** the LM ignores the new compound token format. *Mitigation:* keep `ends rising` and the syllable count in the same line; the principles block names the syntax explicitly. If iteration logs show non-compliance, fall back to the old verbose form.
- **Risk:** the new validator over-flags slant-rhyme line endings. *Mitigation:* only triggers on long final notes, which are the strictest singability case; same vocabulary as the existing held-vowel check, which has been in production without complaint.
- **Risk:** principles block bloats the prompt and pushes long inputs over context. *Mitigation:* ~80 tokens total; far smaller than the per-line block. Acceptable.

## Success criteria

- All existing tests pass.
- New tests in §1 / §2 / §4 pass.
- A representative MIDI generation produces lyrics whose line-final words land on open vowels for `<long>` final notes more often than before — checked by spot inspection of one or two runs.
- The principles block survives a generation round-trip (i.e., the LM produces lyrics consistent with the alignment without quoting the rules back).
