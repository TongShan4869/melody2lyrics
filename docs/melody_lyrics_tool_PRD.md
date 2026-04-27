# Melody-to-Lyrics Tool — PRD

**Date:** 2026-04-26
**Author:** Cu
**Status:** Draft v3 (simplified: English only, single-input lock entry), ready for handoff to Claude Code

---

## Problem

Songwriters who already have a melody (MIDI from a DAW, or a humming recording) have no good tool to generate lyrics that actually scan to that melody. Existing AI lyric tools work in the wrong direction (lyrics → melody) or hide prosody inside black-box end-to-end song generators. The result: lyrics that fight the melody's stress pattern and sound wrong when sung.

A second, equally important problem: when a songwriter already has *some* of the words in mind — a hook phrase, a chorus tag, a single resonant line — they don't want an AI to overwrite or paraphrase those words. They need the AI to write *around* what they've already written.

## Solution

A browser-only web app that:
1. Accepts a MIDI file or audio file (humming/singing).
2. Analyzes the melody's prosody — phrase boundaries, syllable count per phrase, stress pattern, line-ending direction.
3. Lets the user lock specific words at specific positions within any line by typing partial lyrics with `_` as a placeholder for unfilled syllables. Locked content is preserved verbatim; the LLM fills the unlocked positions while honoring overall prosody, rhyme, and theme.
4. Either outputs a structured prompt for the user to paste into any LLM, or generates lyrics directly via an in-tool LLM call, conditioned on user-supplied theme/mood/genre/POV/rhyme/locks/etc.

## Why Now?

- Audio → MIDI in the browser is finally tractable (`@spotify/basic-pitch` runs client-side).
- Frontier LLMs follow detailed prosody specs and gap-fill templates reliably.
- The user is a music producer with a recurring need for this in personal songwriting and game soundtrack work — the tool is dogfoodable from day one.

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| End-to-end time, MIDI → usable lyrics | < 60 seconds | Manual timing on 5 reference melodies |
| Syllable-match accuracy (strict mode) | ≥ 90% of generated lines | Automated count on output |
| Stress-position agreement vs. manual annotation | ≥ 80% | Hand-eval on 5–10 reference melodies |
| Locked-content preservation | 100% verbatim | Automated diff on output |
| User satisfaction (self-eval) | "Would actually use for real songs" | Subjective, after 5 real attempts |

## Scope

**In:**
- Drag-drop web app, browser-only (no backend).
- MIDI input (preferred) and audio input (humming/singing fallback).
- Prosody analysis with manual phrase merge/split.
- Lyrics-context inputs: structured fields + free-text + rhyme scheme + section labels + must-include + avoid-list + strict-syllable toggle.
- **Locked content control:** single text-input per line, using `_` as syllable placeholder. Pre-fill before generation, edit-and-lock after generation.
- **English output only.**
- Two output modes: copy-prompt, or generate-in-tool.
- `.txt` export with prosody metadata.

**Out:**
- Browser-based recording. Upload only.
- Polyphonic transcription. Audio assumed monophonic.
- Mixed-language or non-English output.
- Saved projects, accounts, history.
- DAW plugin, voice synthesis of lyrics, sing-along preview.

## User Flow

```
Drop MIDI/audio → Prosody analysis (auto)
                        ↓
              Manual phrase edit (optional)
                        ↓
         Pre-fill any locked content per line (optional)
                        ↓
                Fill lyrics context form
                        ↓
       ┌────────────────┴────────────────┐
       ↓                                 ↓
  Copy prompt               Generate lyrics in-tool
  (paste in LLM)               (Claude API call)
                                          ↓
                    Display + edit-and-lock + regenerate + export
```

## User Stories

```
US-1  As a producer with a MIDI melody
      I want to upload it and see syllables/stress per phrase
      So that I know what shape my lyrics need to be

      Acceptance Criteria:
      - [ ] Drag-drop or click-to-browse upload
      - [ ] Parse completes in < 200ms for melodies under 500 notes
      - [ ] Each detected phrase shown as a row with syllable count + S/w pattern
      - [ ] Visual: notes as bars, stressed = filled accent color, weak = outlined

US-2  As a user whose phrase auto-detection looks wrong
      I want to manually merge or split phrases
      So that the analysis matches my musical intent

      Acceptance Criteria:
      - [ ] Click between two notes within a phrase to split
      - [ ] Click a phrase boundary to merge with the next phrase
      - [ ] Re-analysis triggers automatically on edit
      - [ ] Undo last edit available

US-3  As a user without MIDI export
      I want to upload a humming recording
      So that I can still use the tool

      Acceptance Criteria:
      - [ ] Accepts .wav, .mp3, .m4a, .ogg up to 10 MB
      - [ ] Transcription completes in < 5s for a 30s monophonic clip
      - [ ] Clear error if pitched notes can't be extracted

US-4  As a songwriter with a specific vibe in mind
      I want to describe theme/mood/genre/POV plus free-text notes
      So that the lyrics reflect my creative direction

      Acceptance Criteria:
      - [ ] Structured fields: theme, mood, genre (preset+custom), POV
      - [ ] Free-text "other notes" textarea
      - [ ] Must-include words and avoid-list as comma-separated inputs

US-5  As a user with strict prosody requirements
      I want to control rhyme scheme, section labels, and syllable strictness
      So that the output matches what I'm trying to write

      Acceptance Criteria:
      - [ ] Rhyme scheme presets (AABB, ABAB, ABBA, XAXA, free) + custom
      - [ ] Section labels comma-separated, one per phrase
      - [ ] Strict-syllable toggle: exact match vs. ±1
      - [ ] Validation: rhyme scheme cycles to fill phrase count if shorter

US-6  As a songwriter who already has some words in mind
      I want to type partial lyrics for a line, using _ as placeholder syllables
      So that the LLM writes around them without changing them

      Acceptance Criteria:
      - [ ] Each phrase row has a single text input, one line per phrase
      - [ ] User types prose; tool tokenizes by syllable
      - [ ] Underscore _ represents one unfilled syllable; multiple _ for multiple
      - [ ] Example: "_ _ love _ _ you tonight" on a 7-syllable line means
        slots 0,1 free → "love" locked at slot 2 → slots 3,4 free → "you"
        locked at slot 5 → "tonight" locked at slots 6-7
      - [ ] Live syllable counter shown next to input: "5/7 syllables"
        (counts both placeholders and locked words)
      - [ ] "Lock entire line" = just type the line with no _ placeholders
      - [ ] Clear button per line

US-7  As a user whose locked words don't match the syllable count
      I want a clear warning and a per-line policy choice
      So that I can decide how the LLM should handle the mismatch

      Acceptance Criteria:
      - [ ] Inline warning when syllable count from input ≠ phrase syllable count
      - [ ] Per-line policy dropdown: "Strict (don't generate this line, I'll fix
        it)" / "Trim (LLM may shorten my words to fit)" / "Pad (LLM adds syllables
        around my words to fit melody)" / "Let LLM decide"
      - [ ] Default policy: "Strict" (safest)
      - [ ] Syllable counter live-updates as user types

US-8  As a user happy with one generated line but wanting to regenerate the rest
      I want to lock that line after generation and regenerate the others
      So that I can iterate without losing good lines

      Acceptance Criteria:
      - [ ] Each output line has a "Lock" toggle
      - [ ] Locked output lines persist into next "Regenerate"
      - [ ] User can edit a locked line in place; edit auto-locks the line
      - [ ] "Unlock all" + "Lock all" bulk actions

US-9  As a user who wants to use my preferred LLM
      I want to copy a fully-formed prompt to clipboard
      So that I can paste into Claude/ChatGPT/whatever

      Acceptance Criteria:
      - [ ] "Copy prompt" button copies to clipboard with confirmation
      - [ ] Prompt is also visible in a collapsible code block
      - [ ] Prompt regenerates whenever any context field or lock changes
      - [ ] Locked content represented in prompt as a clear template (see FR14)

US-10 As a user who wants the fastest path
      I want to generate lyrics in-tool with one click
      So that I can iterate quickly

      Acceptance Criteria:
      - [ ] "Generate" button calls Claude API (claude-sonnet-4-20250514)
      - [ ] Loading state with cancellation
      - [ ] Output shows each line with syllable + stress check below
      - [ ] Locked content visually distinguished from generated content
      - [ ] Regenerate button keeps prompt + locks, re-runs

US-11 As a user happy with the output
      I want to export it
      So that I can take it into my DAW or notes

      Acceptance Criteria:
      - [ ] Copy-to-clipboard (plain text, no metadata)
      - [ ] Download .txt with metadata header (filename, date, prosody spec, locks)
```

## Functional Requirements

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR1 | Parse MIDI files via `@tonejs/midi`, pick track with most notes | P0 | Core input path |
| FR2 | Audio transcription via `@spotify/basic-pitch`; fall back to in-house Web Audio if bundling blocks CDN load | P0 | See open question Q1 |
| FR3 | Phrase segmentation: gap ≥ max(0.4s, 2.0 × median_gap) | P0 | Thresholds configurable |
| FR4 | Beat grid estimation: histogram of IOIs in [0.1s, 2.0s], 50ms buckets, mode × 2 = beat | P0 | Heuristic |
| FR5 | Per-note stress score = 0.45·metric + 0.25·duration + 0.20·pitch + 0.10·velocity | P0 | Weights are constants in code |
| FR6 | Stress threshold: top 40% of phrase scores = S, rest = w | P0 | 40% is a tunable constant |
| FR7 | Line-ending direction: lastNote.pitch ≥ secondToLast.pitch → rising, else falling | P0 | Proxy for intonation |
| FR8 | Visual prosody display: phrases as rows, notes as bars, stressed in accent color | P0 | See US-1 |
| FR9 | Manual phrase merge/split | P1 | See US-2 |
| FR10 | Lyrics-context form with all fields from US-4, US-5 | P0 | English only |
| FR11 | Rhyme scheme cycling validation | P0 | |
| FR12 | **Locked-content text input per line.** Single text input per phrase. Tokenize input: whitespace-separated tokens, where `_` (underscore) = one free syllable, any other token = a locked word counted by `syllableCount(word)`. | P0 | See locked-content design below |
| FR13 | **Lock representation in prompt.** Locked lines must appear in the prompt as templates with explicit slot markers, e.g., `Line 3 [chorus] (rhyme: B): 7 syllables, stress = S-w-S-w-S-w-S, template = "[?] [?] love [?] [?] you tonight" — fill the [?] slots only, do not modify other words.` | P0 | Critical for prompt fidelity |
| FR14 | **Mismatch detection.** Compute total syllable count from line input (placeholders + locked words). Show warning if ≠ phrase syllable count. | P0 | |
| FR15 | **Per-line lock policy.** Dropdown per line: `strict` / `trim` / `pad` / `auto`. Default `strict`. | P0 | |
| FR16 | **Edit-and-lock for output lines.** Each generated line has a lock toggle; editing in place auto-locks. | P0 | |
| FR17 | **Bulk lock actions.** "Lock all" / "Unlock all" / "Clear locks". | P1 | |
| FR18 | **Post-generation lock validation.** After generation, diff each output line against its lock template. If a locked word was modified, mark the line INVALID with a regenerate button. | P0 | LLMs sometimes paraphrase locked words despite instruction |
| FR19 | Copy-prompt mode | P0 | |
| FR20 | Generate-in-tool mode (Claude API) | P0 | |
| FR21 | Regenerate without re-entering context, preserving locks | P0 | |
| FR22 | .txt export with metadata header including locks | P1 | |
| FR23 | File size cap 10 MB with clear error | P0 | |

## Locked-Content Design (detail for FR12–FR18)

### Input syntax

For each phrase, the user sees one text input. The tokenization rule:

- Split input on whitespace.
- Each token is one of:
  - `_` → one free syllable (unfilled placeholder)
  - Any other word → a locked word, consuming `syllableCount(word)` consecutive syllables.

Examples (all targeting a 7-syllable line):

| Input | Interpretation | Total syllables |
|---|---|---|
| (empty) | All 7 free | 7/7 ✓ |
| `_ _ love _ _ you tonight` | free, free, "love"(1), free, free, "you"(1), "tonight"(2) | 7/7 ✓ |
| `And we'll burn until the morning light` | fully locked | 8/7 ✗ warning |
| `_ _ _ _ _ _ tonight` | 6 free + "tonight"(2) | 8/7 ✗ warning |
| `hello _ _ _ goodbye` | "hello"(2) + 3 free + "goodbye"(2) | 7/7 ✓ |

### Syllable counting

- Use the `syllable` npm package (small, browser-friendly, dictionary + heuristic).
- Allow user to override per-word with a `:N` suffix (e.g., `fire:1` to count "fire" as 1 syllable in fast singing).
- For contractions ("we'll", "I'm"), the package handles them; spot-check during testing.

### Live syllable counter UI

Below each input field, show:
```
5/7 syllables  ✓
```
or
```
8/7 syllables  ⚠ Too long — pick a policy or trim
```

### Data model

```ts
type Token =
  | { kind: 'free' }                                  // a single _
  | { kind: 'locked'; word: string; syllables: number };

type PhraseLockState = {
  phraseIndex: number;
  rawInput: string;                  // what the user typed
  tokens: Token[];                   // parsed
  totalSyllables: number;
  policy: 'strict' | 'trim' | 'pad' | 'auto';
  lockedAfterGeneration: boolean;    // true once user clicks "Lock" on output
};
```

### Prompt format with locks (FR13)

```
MELODY PROSODY (with locked content):

Line 1 [verse] (rhyme: A) — 8 syllables, stress = S-w-S-w-S-w-S-w, ends falling
  Template: open (write any 8-syllable line)

Line 2 [verse] (rhyme: A) — 7 syllables, stress = S-w-S-w-S-w-S, ends rising
  Template: [?] [?] love [?] [?] you tonight
  Locked words: "love" (1 syl, position 3), "you" (1 syl, position 6),
                "tonight" (2 syl, positions 7-8)

Line 3 [chorus] — fully locked, do not modify:
  "And we'll burn until the morning light"

Line 4 [chorus] — 8 syllables, policy=pad
  Template: [?] [?] [?] burn forever [?]
  My locked content is 5 syllables but the line needs 8 — please pad with
  natural-sounding words around my locked words to make it scan.

RULES:
1. For lines with templates: fill ONLY the [?] slots. Do not change locked words.
2. For fully locked lines: do not modify. Use them only to inform rhyme,
   theme, and continuity of surrounding lines.
3. [strict/loose syllable rule based on global toggle]
4. ...
```

The prompt builder must:
- Compute slot indices (positions) from token stream and emit them clearly.
- Convert per-line `policy` into explicit instructions in the prompt for any non-default lines.
- If a line's `totalSyllables ≠ phrase.syllables` AND `policy === 'strict'`, surface a UI error and disable Generate until resolved.

### Post-generation lock validation (FR18)

After receiving the LLM output, parse each line and check:
- Are all locked words from the original template still present, in the same order?
- Diff char-by-char on locked tokens.

If any locked word was modified, paraphrased, or removed:
- Mark the line as INVALID in the UI (red border).
- Show a "Regenerate this line" button that re-runs with stricter prompting (e.g., "Your previous output modified the word 'tonight'. The locked words MUST appear verbatim. Try again.").

## Non-Functional Requirements

- **Performance:** MIDI parse + analysis < 200ms for melodies under 500 notes. Audio transcription < 5s for a 30s monophonic clip. Lock input must update syllable counter within 50ms of keystroke.
- **Browser-only:** No backend. In claude.ai context, the in-artifact Claude API is auto-authed. For standalone deployment, document a "bring your own API key" path.
- **Accessibility:** Keyboard navigation for all controls. Color contrast ≥ WCAG AA.
- **Responsive:** Desktop two-column layout. Stacks single-column under 900px width.
- **Visual direction:** Refined editorial dark theme. No emojis. No purple gradients. No glassmorphism. Distinctive serif display + clean sans body + monospace for prosody readouts and locked-content input.

## Technical Notes

### Suggested module layout
```
src/
  prosody.ts      # pure analysis functions, unit-tested
  midi.ts         # @tonejs/midi wrapper
  audio.ts        # basic-pitch wrapper + Web Audio fallback
  syllables.ts    # English syllable counting + override syntax
  locks.ts        # tokenization, slot computation, validation
  prompt.ts       # prompt construction (handles free + partial + full locks)
  llm.ts          # API call wrapper, swappable
  components/
    LockInput.tsx   # the per-phrase text input + syllable counter
    ...
```

### Test cases

Prosody:
- Single-phrase melody → one phrase
- Two phrases separated by 1s rest → two phrases
- All-equal-duration notes on the beat → first note stressed
- Long note on offbeat → still stressed (duration weight wins)
- Empty input → empty result, no crash
- Single-note input → one phrase, syllables=1

Locks:
- Empty input on 5-syl line → all free, prompt template = open
- `_ _ love _ _` on 5-syl line → tokens [free, free, locked("love",1), free, free], total=5, ✓
- `tomorrow _ _ _` on 5-syl line → [locked("tomorrow",3), free, free, free], total=6, ✗ warning
- `Hello world` on 4-syl line → [locked("hello",2), locked("world",1)], total=3, ✗ warning (under)
- `fire:1 _ _ _` on 4-syl line → "fire" overridden to 1 syllable, total=4, ✓
- Fully locked: `And we burn` on 4-syl line → all locked, prompt = "fully locked, do not modify"
- Post-gen: LLM returns "And we'll burn until the dawning light" but locked was "morning" → INVALID, regenerate offered
- Edit a generated line → auto-locks; next regenerate preserves it verbatim

### Visual direction

- Dark background ~#0e0d0c, warm tan accent ~#d4a574.
- Display font: Fraunces or Cormorant Garamond.
- Body font: Inter Tight or IBM Plex Sans.
- Mono: JetBrains Mono or IBM Plex Mono (for S/w readouts and lock input).
- Locked words in output: filled accent color background.
- Free placeholders in input: rendered as `_` in mono.
- Stress markers (S/w) shown as a faint mono row above each phrase.

## Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| `basic-pitch` doesn't load via CDN; needs bundler | Medium | Medium | Fall back to in-house Web Audio onset+autocorrelation. |
| Prosody analysis is wrong for unusual time signatures (3/4, 6/8, 7/8) | Medium | Low | Manual phrase edit (FR9). v2 adds explicit time-sig override. |
| English syllable counting wrong for proper nouns, neologisms, songwriter elisions ("ev'ry") | High | Medium | Manual override syntax `word:N`. Document. |
| LLM ignores slot template and rewrites locked words | Medium | High | Post-generation diff (FR18); INVALID line state with regenerate. |
| User wants to type a literal underscore as a word | Low | Low | Document: type `\_` to escape. v1 accepts the limitation. |
| Standalone deployment needs API key handling | High | Low | "Bring your own key" path documented; not a v1 blocker if dogfooding inside claude.ai. |

## Timeline

Solo build, revised estimate (simpler than v2):
- Prosody module + tests: 1 day
- MIDI loading: 0.5 day
- Audio loading + transcription: 1–2 days (basic-pitch integration is the wildcard)
- English syllable counting + override: 0.25 day
- Lock tokenization + validation logic + tests: 0.75 day
- Lock input component (single text field + counter): 0.5 day
- UI scaffold + context form: 1 day
- Phrase visualization + manual phrase edit: 1 day
- Prompt builder (with lock templates) + LLM integration + post-gen diff: 1 day
- Polish, export, edge cases, warnings: 1 day

**Estimated total: 8 days of focused work.** (was 9–10 with the slot-grid UI)

## Open Questions

1. **Does `@spotify/basic-pitch` work via CDN in a browser-only build, or does it require a bundler?** If bundler-only, decide: ship as Vite project, or fall back to in-house Web Audio.
2. **Manual phrase editing UI:** click-to-split + click-to-merge, or drag-to-resize bars? Recommend click-based for v1 — much simpler.
3. **Deployment target:** dogfood inside claude.ai artifact only, or standalone web deployment? Affects whether API key UI is needed.
4. **Post-generation lock validation:** if the LLM violates a lock, do we (a) show output with violations highlighted and let user accept/regenerate, or (b) auto-regenerate up to N times? Recommend (a) for v1 — gives user control.

## Future (v2+)

- Browser-based recording.
- Polyphonic transcription (chord-aware analysis).
- DAW plugin (VST/AU).
- TTS sing-along preview aligned to original melody.
- Mixed-language and non-English output (Mandarin, Japanese, Spanish, etc.).
- Per-language phonetic stress detection (Mandarin tone-aware, Japanese mora-aware).
- Save/load projects.
- Suno/Mureka handoff: export lyrics + melody as starter pack.
- Rhyme suggestion popover: given a free position, show possible rhyming words that fit syllable + stress.
- Line history: preserve all previous generations of a line for A/B comparison.
