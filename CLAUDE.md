# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server on http://127.0.0.1:5173/
npm test         # vitest run (single pass, no watch)
npm run build    # tsc type-check then vite build
npm run preview  # serve production build
```

Run a single test file: `npx vitest run src/prosody.test.ts`. Run a single test by name: `npx vitest run -t "estimateBeat"`.

The app is a Vite SPA — opening `index.html` via `file://` will not work. Always use the dev server.

## Architecture

The app is a browser-only React SPA. There is no backend; LLM API keys entered in the UI are sent directly from the browser to OpenAI / Anthropic / DeepSeek. Anthropic's call uses `anthropic-dangerous-direct-browser-access: true` because the SDK normally refuses browser CORS.

### Data flow

`MIDI file → parseMidiFile (midi.ts) → analyzeNotes (prosody.ts) → Phrase[] → detectSections (structure.ts) → runPipeline (agent.ts) → GeneratedLine[]`

`runPipeline` is the generation entry point — it builds the prompt (`prompt.ts`), calls the chosen provider (`llm.ts`) via an injected `LLMCall`, parses the response, runs `validateLines` (`validators.ts`), and either accepts or revises (up to 3 iterations) by feeding failures and prior attempts back to the model with `buildRevisionPrompt`. The pipeline is provider-agnostic — it never imports `llm.ts` directly.

Module roles:

- **`midi.ts`** — picks the track with the most notes, normalizes time signature/PPQ, preserves `ticks` so `prosody.ts` can do tick-accurate metric stress. Also exports `buildSampleMelody` for the "Try a sample" CTA.
- **`prosody.ts`** — gap-based phrase segmentation, then `splitOversizedPhrase` enforces auto line bounds (6 / 12 / 20 syllables) so dense rap runs don't become one giant line. `metricStress` prefers tick math (uses `ppq` and time signature) and falls back to seconds-based beat estimation. Stress is musical position, **not velocity** — `prosody.test.ts` enforces this. If a phrase has zero strong notes, the highest-scoring note is anchored as `S` so prompts stay usable. Each note also carries a **`length`** field (`'L'` if its duration exceeds the phrase mean, `'S'` otherwise) per the XAI-Lyricist definition.
- **`structure.ts`** — `detectSections` clusters phrases by melodic similarity (pitch contour + rhythm correlation) and labels the largest recurring cluster as Chorus, the rest as Verse, with run-based numbering. Runs once at MIDI upload to pre-fill `sectionLabels`; the user can still override via the toolbar dropdown.
- **`prompt.ts`** — composes the LLM prompt. Two rhyme modes: `SECTION` (default; one rhyme family per section) and a per-line scheme (`ABAB`, `AABB`, `AXAX` where `X` = no rhyme); per-line pattern restarts at each new section. `LyricsContext.direction` (optional freeform string) replaces the structured Theme/Mood/Genre/POV block when present — that's how the Step 3 textarea feeds into the prompt. `buildRevisionPrompt` appends a CURRENT DRAFT block, [FAILING]/[KEEP] tags, and prior attempts so the model doesn't re-emit them.
- **`validators.ts`** — six pure validators: `syllableValidator`, `lockedWordsValidator`, `endCollisionValidator`, `fillerEndingValidator`, `heldVowelValidator`, `avoidWordsValidator`. `validateLines` aggregates them per line.
- **`vowels.ts`** — embedded ARPAbet final-vowel lookup powering `heldVowelValidator`.
- **`locks.ts`** — `_` is one open syllable; any other token is a locked literal counted by `syllable()`. `word:N` overrides the syllable count (e.g. `fire:1`). Locked words are validated against generated output by case-insensitive ordered substring search.
- **`syllables.ts`** — `countSyllables` for syllable counting; `splitSyllables` / `splitLineSyllables` for the Active Line slot row visualization (heuristic VC*V splitter, visual only — not a linguistic dictionary).
- **`playback.ts`** — `schedulePreview` plays a notes array via WebAudio. Skips notes that end before the seek `offsetSeconds` (otherwise they all stack at `startAt` as a chord-burst). Stop ramps the master gain to silence over 20ms before disconnecting.
- **`llm.ts`** — three plain `fetch` clients (Anthropic / OpenAI / DeepSeek). Each takes `(prompt, apiKey, model, signal)`. The "Built-in Claude" provider from the original Claude Design handoff was iframe-host-specific (`window.claude.complete`) and is not present here.
- **`agent.ts`** — `runPipeline` async generator: yields each `Iteration`, returns the final `IterationLog`. Takes an `LLMCall` dependency so it stays portable to a server-side runner.

### State conventions in `App.tsx`

- `phrases`, `locks`, `sectionLabels`, and `output` arrays must always have the same length as `phrases`. The split/merge handlers and `setupMelody` keep them in sync — never call `setPhrases` without also resizing the others.
- `effectiveLocks` (memoized) overlays `output[i].locked` onto `locks[i]` so a user-locked generated line is treated as fully locked in the next prompt build. `lockedAfterGeneration` distinguishes this from user-typed locks.
- `pinnedLines` (built fresh inside `generate()` from `output[i].locked`) is what the pipeline uses to preserve locked lines verbatim across revision iterations.
- Section labels are stored per-line as plain strings; the toolbar dropdown sets one index at a time. `prompt.ts` still treats consecutive identical labels as a section run.
- `playbackRef` / `animRef` / `audioRef` must all be torn down via `stopPreview` — the cleanup effect runs on unmount. `playGenRef` is a generation counter that invalidates stale `await ensureCtx()` callbacks during rapid play/seek interactions.

### UI conventions (post-redesign)

The UI was rebuilt from a Claude Design handoff (commit `b6c55b6`). Three-step IA in one screen:

1. **Empty state** — drop zone + "Try a sample melody" CTA, no controls.
2. **Step 2 · Shape** — left panel: sticky toolbar (play/stop/play-line + prev/next + section dropdown + merge/split, all targeting the *selected* phrase) above a piano roll, with an Active Line focus panel below showing only the selected (or auto-followed-during-playback) phrase. Slot row under the lyric input shows `S/w` markers above and the auto-flowed syllable text below.
3. **Step 3 · Styles** — right panel (`position: sticky`): single freeform textarea (preloaded with a Theme/Mood/Genre template) + a horizontally scrollable row of style chips + rhyme strategy + strict-syllable toggle + Generate bar.

After generation a Full Lyrics card appears below the workspace with all lines stacked, section headers, syllable badges, per-line lock toggles. The Active Line and Full Lyrics card stay in sync — clicking a row in the card selects that phrase upstream.

Conventions to preserve:
- **Pink editorial accent** `#f5b8c8`. Themes (Editorial / Studio / Paper) live in `components/TweaksPanel.tsx`'s `THEMES` constant; switch via the floating cog (bottom-right). Don't hard-code accent colors in components — use `var(--accent)` etc.
- **Right panel `.panel-sticky`** stays in view as the workspace scrolls. Keep `min-width: 0` on flex children of `.line-editor` and the workspace grid track set to `minmax(0, 1fr)` — without these a long lyric input pushes the page sideways.
- **Inline SVG icons** via `components/Icons.tsx` (no `lucide-react` import).
- **Tweaks** persist via `localStorage` under `melody2lyrics:tweaks`.

## Project-specific gotchas

- **Model IDs go stale.** The Step 3 generate bar uses a free-text Model ID input (no curated dropdown). Verify against current provider docs before suggesting one.
- **Stress must come from metric position, not MIDI velocity.** `prosody.test.ts` has a regression test for this; preserve it.
- **Manual phrase edits should survive re-analysis.** `mergePhrases` and `splitPhrase` re-run `analyzePhraseGroups` over the manually grouped notes rather than re-segmenting from scratch.
- **`schedulePreview` must skip notes that end before the seek offset.** A bug here piled every past note onto the seek instant as a chord. Regression risk if you refactor playback.
- **`parseLockInput` must preserve `rawInput` verbatim** (no implicit trim on the stored string) — otherwise typing into the Active Line eats trailing spaces and you can't type a second word.
- **The pipeline is silent on `capped` finalStatus.** The toast wording differs (`"some may not perfectly match stress"` vs the standard success), but there's no iteration log or per-line warn badge in the UI by design — the user explicitly chose this.
- **The user wants commit approval after each change.** After making edits, ask before running `git commit`.

## Reference docs

- `README.md` — user-facing feature list and lock syntax.
- `docs/melody_lyrics_tool_PRD.md` — full product requirements.
- `docs/superpowers/specs/2026-04-29-agentic-lyric-pipeline-design.md` — design doc for the agentic pipeline.
- `docs/superpowers/plans/2026-04-29-agentic-lyric-pipeline.md` — implementation plan that produced PR #1.
- `docs/superpowers/specs/2026-05-02-prosody-singability-design.md` — design doc for the length-axis prosody upgrade.
- `docs/superpowers/plans/2026-05-02-prosody-singability.md` — implementation plan for the length-axis prosody upgrade.
- `docs/knowledge/singability.md` — curated XAI-Lyricist alignment principles used by the prompt and validators.
- `docs/XAI_LYRICS.pdf` — original XAI-Lyricist paper.
