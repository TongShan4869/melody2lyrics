# Agentic Lyric Pipeline — Design

**Status:** Draft for review
**Date:** 2026-04-29
**Scope:** Replace the single-shot prompt+generate flow with a deterministic agentic pipeline that auto-detects song structure, generates lyrics, validates them with mechanical checks, and revises only the failing lines. Browser-only deployment, multi-provider, same one-screen UX with smarter defaults.

---

## Goal

Today the app builds one prompt, calls one LLM, and shows the output. Quality varies because:

- Manual phrase/section editing is tedious — users skip it, defaults are weak.
- The LLM sometimes returns wrong syllable counts, repeated end words, awkward held vowels, or default filler rhymes — and the user has no recourse beyond regenerating the whole song.

The pipeline addresses both:

- Smarter defaults at upload (melodic-repetition section detection, musical-boundary phrase splits) so most users don't need to edit structure.
- Deterministic generate → validate → targeted-revise loop after generation, capped at 3 iterations, so quality issues are caught and fixed without re-rolling the whole song.

## Non-goals

- No backend / serverless layer in this round. Validators ship in the JS bundle. Architecture is portable so we can lift the orchestrator server-side later without rewriting the loop.
- No real tool-use API integration (Anthropic `tool_use` / OpenAI function calling). The "agent" is a deterministic controller; the LLM is a plain text-completion at each stage.
- No CMUdict (multi-MB). Held-vowel check uses an embedded vowel table for the top ~5k common words; unknown words skip that check.
- No stress-alignment validator (defer; needs phonetic stress data).
- No automatic in-line section-label propagation across detected repeats during editing — we propose it once at upload and offer a hint when the user changes a label, but don't auto-rewrite.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ App.tsx (UI state, user actions)                        │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
   structure.ts     agent.ts          validators.ts
   (one-shot at    (controller         (pure check
    upload)         orchestrating       functions)
                    iterations)
                         │
                         ▼
                     prompt.ts
                  (initial + revise
                   prompt builders)
                         │
                         ▼
                       llm.ts
                 (provider fetchers,
                  same as today)
```

**Key boundary decisions:**

- `agent.ts` takes an `LLMCall` function as a dependency. It does not know about `fetch` or which provider. This is what makes it server-portable.
- `validators.ts` exports pure `Validator` functions. No I/O, no React. Trivially testable, trivially movable to a Node runtime later.
- `structure.ts` runs once at MIDI upload. Output is consumed by `App.tsx` to set initial `phrases` + `sectionLabels`. After that, manual edits override.

## Pipeline stages

### Stage 0 — Structural analysis (on MIDI upload)

Runs after `parseMidiFile` and `analyzeNotes`, before phrase rows render.

**Phrase boundaries.** Existing gap-based + oversized-split logic stays. New: when a phrase would otherwise split mid-bar, snap to the nearest downbeat if doing so doesn't violate the syllable bounds (6/12/20). Reduces "phrase ends on an upbeat" awkwardness.

**Section detection (new).** For each pair of phrases compute a similarity score:

- Pitch contour similarity: normalize each phrase's pitch sequence (subtract mean, scale to unit length), then compute Pearson correlation between sequences padded to the same length.
- Rhythmic similarity: compare duration sequences normalized to phrase-median.
- Length match: same syllable count gets a small bonus.

Cluster phrases by score ≥ 0.85 (tunable). Each cluster of size ≥ 2 is a recurring section.

**Auto-labeling heuristic.**

1. The largest recurring cluster → `Chorus`.
2. The next largest → `Verse`.
3. Single phrases between recurring clusters → `Pre-chorus` if short, `Bridge` if late in the song.
4. Fall back to `Section A`, `Section B`, … if heuristic is ambiguous.

Each cluster's instances get a numeric suffix in order: `Chorus 1`, `Chorus 2`, etc.

User can override any label. We do not re-run detection after manual edits.

### Stage 1 — Initial generation

Same as today: `buildPrompt(phrases, locks, context, sectionLabels)` → `LLMCall(prompt)` → split into lines → trim numbering.

### Stage 2 — Validation

Run all validators against each output line. Result per line:

```ts
type LineValidation = {
  index: number;
  text: string;
  passed: boolean;
  failures: ValidationFailure[];
};

type ValidationFailure = {
  type: 'syllables' | 'locked-words' | 'end-collision' | 'filler' | 'held-vowel' | 'avoid';
  message: string;
};
```

Validator set:

| Validator | Check | Source |
|---|---|---|
| Syllables | `countSyllables(line)` matches `phrase.syllables` (±1 if `strictSyllables=false`) | existing `syllables.ts` |
| Locked words | `validateLockedWords(line, lock)` returns valid | existing `locks.ts` |
| End collision | Within the same `sectionLabel`, no two lines share their final word (case-insensitive, punctuation-stripped) | new |
| Filler ending | Final word not in default filler list (currently hard-coded in `prompt.ts`: light, night, tonight, fire, higher, sky, shine, bright, ignite — extracted into a shared constant), unless that word is in `context.mustInclude` | new, reuses prompt.ts list |
| Held vowel | If the phrase's final note is in the `held` rhythm bucket, the final syllable's vowel must be one of `/eɪ/, /aɪ/, /oʊ/, /aʊ/, /ɑː/, /ɔː/, /uː/, /iː/`. Lookup via embedded ARPAbet table; unknown words skip the check (passes by default) | new |
| Avoid words | No line contains any word from `context.avoid` (split on whitespace/comma) | new |

### Stage 3 — Targeted revision (loop)

If any line fails, build a revision prompt:

- Show all current lines, marking which are failing and why.
- Instruct the model to rewrite **only the failing lines**, keeping the others verbatim.
- For each failing line, include the full failure list and the original phrase constraints (syllables, stress pattern, rhythm profile, ending direction, locks).
- On iteration ≥ 2, also include the previous failed attempt for that line and explicitly request a different direction.

Inter-line failures (end-collision): the controller picks which side to revise. Heuristic: revise the line with fewer locked-word constraints; if tied, revise the later line. The other side becomes context.

Replace failing lines in the working set with the new ones. Re-validate. Loop.

### Stop conditions

- All lines pass validation → stop, status `clean`.
- Iteration count reaches **3** → stop, status `capped`. Surface remaining failures in the UI.
- LLM call fails (network, rate limit, abort) → stop, status `error`. Show partial result if any iterations completed; allow user to resume.

## Data shapes and orchestrator API

```ts
type IterationLog = {
  iterations: Iteration[];
  finalStatus: 'clean' | 'capped' | 'error';
  errorMessage?: string;
};

type Iteration = {
  number: number;            // 1-indexed
  kind: 'initial' | 'revise';
  output: string[];          // full song; pinned positions echo their pinned text
  validations: LineValidation[];
  failingIndices: number[];
};

type PipelineInput = {
  phrases: Phrase[];
  locks: PhraseLockState[];
  sectionLabels: string[];
  context: LyricsContext;
  pinnedLines: Map<number, string>;   // line index -> verbatim text; never revised
  llmCall: (prompt: string, signal?: AbortSignal) => Promise<string>;
  maxIterations?: number;             // default 3
  signal?: AbortSignal;
};

// Streaming so the UI updates as each iteration completes.
async function* runPipeline(input: PipelineInput): AsyncGenerator<Iteration, IterationLog>;
```

The controller maintains a per-line attempt history internally and includes prior failed attempts in iteration ≥ 2 prompts.

`App.tsx` consumes the generator, updating `IterationLog` state on each yield. `output: GeneratedLine[]` is derived from the latest iteration. The existing `output[i].locked` flag controls what goes into `pinnedLines` for the next pipeline run, so today's per-line lock UX continues to work; "Revise rest" simply triggers another `runPipeline` call with the locked lines pinned.

## UX changes

**Upload.** No new gesture. Phrases and section labels appear pre-populated from `structure.ts`. Each phrase row gets a small `auto` chip indicating how its boundary was determined. Manual edits flip the chip to `manual` and are preserved across re-analysis.

**Section editing.** When the user changes a section label and the phrase belongs to a detected recurrence cluster, show a one-line hint: *"Phrases 12 and 18 share this melody — apply the same label?"* with Apply / Dismiss. No auto-propagation.

**Generate button.** Shows progressive states: `Analyzing → Generating → Validating → Revising lines 3, 7 → …`. Stays disabled until done or canceled.

**Iteration log.** Card below the prompt box, default **expanded**. Each iteration shown as:

```
Iter 1 · 5/8 lines passed
  Line 3 — 8 syllables (target 7)
  Line 7 — ends in "tonight" (collides with line 5)
  Line 7 — filler ending

Iter 2 · 8/8 passed ✓
Stopped: clean
```

Collapsible. Iteration N's prompts available in a debug-only view (toggle in future, not shipped now).

**Output panel.** Each line carries a status badge: green check (passed) or yellow warning (failed in final iteration). Hovering / clicking a yellow badge expands the failure reasons. Other affordances (lock, edit, copy, export) unchanged.

**New button: "Revise rest".** Re-runs the pipeline on currently unlocked lines only. Locked lines are pinned context.

**Failure surface.** When status is `capped`, the iteration log makes it explicit: "Stopped after 3 iterations with 2 lines unresolved." Output still appears with yellow badges. User can edit manually or click Revise rest.

## File-level changes

**New modules:**

- `src/structure.ts` — `detectSections(phrases) → string[]` (parallel to phrases, default labels). Pure function, deterministic.
- `src/validators.ts` — exports each validator and a top-level `validateLines(lines, phrases, locks, context, sectionLabels) → LineValidation[]`. Pure functions.
- `src/vowels.ts` — embedded ARPAbet vowel table (top ~5k common words). Lookup function `finalVowel(word) → ArpabetVowel | null`.
- `src/agent.ts` — `runPipeline(input) → AsyncIterable<Iteration> | Promise<IterationLog>`. Streaming variant lets `App.tsx` update the iteration log live as each iteration finishes.
- Tests: `structure.test.ts`, `validators.test.ts`, `agent.test.ts` (controller logic only — uses a stub `LLMCall`).

**Modified:**

- `src/prompt.ts` — `buildPrompt` stays as the initial-prompt builder. Add `buildRevisionPrompt(state, failingIndices, previousAttempts) → string`.
- `src/types.ts` — add the types listed above.
- `src/App.tsx` — replace `generateLyrics` with `runAgenticPipeline`. Wire the iteration log UI. Auto chips on phrase rows. Section-recurrence hint on label change.
- `src/prosody.ts` — small extension: `analyzeNotes` accepts a `snapToDownbeat: boolean` option (default true) for the boundary improvement.

**Unchanged:**

- `src/midi.ts`, `src/llm.ts`, `src/locks.ts`, `src/syllables.ts`, `src/playback.ts`, `src/components/*`.

## Iteration policy details

- Max iterations: **3** (initial + 2 revisions).
- Each revision sees previous failed attempts for context. Format inside the prompt:
  > Line 3 — your previous attempts:
  >   Attempt 1: "...". Failed: 8 syllables, target 7.
  >   Attempt 2: "...". Failed: ends in "tonight" (filler).
  > Try a different direction.
- A line that flips between failing and passing across iterations is treated as currently failing if it fails in the latest iteration. We do not "remember" earlier passes.

## Testing strategy

- `structure.test.ts` — feed synthetic phrase arrays with known repeats; assert detected clusters and labels.
- `validators.test.ts` — one test per validator, plus an integration test running `validateLines` against fixtures.
- `agent.test.ts` — controller logic with a stub `LLMCall` that returns scripted responses. Cover: clean on iter 1, clean on iter 2, capped at iter 3, error mid-loop, abort signal.
- `prompt.test.ts` — extend with cases for `buildRevisionPrompt`.
- Existing tests should continue to pass. `npm test` is the regression check.

## Open questions / deferred

- **Held-vowel table size.** Top 5k common words probably covers most generated lines. If coverage turns out to be < 80%, escalate to top 20k or move to a server-side CMUdict lookup.
- **Section heuristic naming.** The Chorus/Verse heuristic is a starting point. Real songs sometimes have a chorus that doesn't repeat. We accept that the user will sometimes correct labels.
- **Stress-alignment validator.** Deferred until we have a phonetic stress source. When added, it slots into the existing validator interface with no controller changes.
- **Iteration log debug view.** Not shipped now. Add when needed.
- **Server-side lift.** When we want CMUdict and longer chains, lift `agent.ts` + `validators.ts` + `structure.ts` to a Vercel function. The browser keeps `prompt.ts`, `llm.ts` becomes a single call to the function, UI is unchanged.
