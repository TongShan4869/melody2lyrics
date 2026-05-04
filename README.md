# Melody to Lyrics

A browser-only songwriting tool that turns a MIDI melody into a prosody-aware lyric prompt or generated lyric draft. The app analyzes melody phrases, syllable counts, stress patterns, line endings, and locked lyric fragments so generated lyrics can scan against the melody instead of fighting it.

## Features

- Upload `.mid` / `.midi` files under 10 MB; parsed with `@tonejs/midi`, picking the track with the most notes.
- Show MIDI metadata: track name, tempo, meter, and PPQ.
- Two-axis prosody analysis per the XAI-Lyricist taxonomy:
  - **Strength** — strong / weak beats marked `S` / `w` from tick-accurate metric position (not velocity).
  - **Length** — long / short notes per the paper's definition (duration > phrase mean).
- Each line in the LLM prompt carries a compound template such as `<strong,long>-<weak,short>-...` so the model honors both axes.
- Section detection clusters melodically-similar phrases and labels them `Chorus` / `Verse` with run-based numbering. The toolbar dropdown lets you override.
- Recurring melodies get a `(repeat A)` annotation in the prompt so the model can produce intentional hook repetition rather than incidental duplicates.
- Active-line slot row with `S` / `w` markers and auto-flowed syllable text.
- Lock partial lyric content per line with `_` placeholders, plus `word:N` syllable overrides (e.g. `fire:1`).
- Manually split phrases by clicking note bars or merge adjacent phrases.
- Preview the full MIDI or play each phrase/line individually.
- Seven validators run on every generation and drive up to 3 revision iterations: syllable count, locked words, end-word collision, default-filler endings, held-vowel singability, length-alignment singability, avoid-word list.
- Generate lyrics in-tool with OpenAI, Anthropic, or DeepSeek API keys.
- Free-text Model ID input — paste any current identifier from the chosen provider.
- View the raw prompt at any time, copy lyrics, or export a `.txt` file with metadata.

## Quick Start

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Do not open `index.html` directly with `file://`; this is a Vite app and needs the dev server.

## Scripts

```bash
npm run dev      # start local dev server
npm run build    # type-check and build production assets
npm run preview  # preview the production build
npm test         # run unit tests
```

## How To Use

1. Upload a MIDI melody.
2. Review phrase segmentation, syllable counts, stress pattern, and ending direction.
3. Use `Play preview` or `Play line` to audition the melody.
4. Optionally split or merge phrase boundaries.
5. Add locked lyric fragments with `_` for open syllable slots.
6. Describe the song in the freeform direction textarea — genre, mood, theme, POV, anything that should shape the lyric. Style chips, rhyme strategy, and a strict-syllable toggle live alongside it.
7. Copy the generated prompt or enter an API key and generate in-tool.
8. Edit and lock good output lines, then regenerate the rest.
9. Copy lyrics or export a `.txt` file.

## Locked Lyric Syntax

Each `_` means one open syllable. Any other token is treated as locked text and counted by syllable.

```text
_ _ love _ _ you tonight
```

For a 7-syllable line, this means:

- slots 1-2 are open
- `love` is locked
- slots 4-5 are open
- `you` is locked
- `tonight` is locked as two syllables

Use `word:N` to override syllable counts:

```text
fire:1 _ _ _
```

## In-Tool Generation

The app can call:

- OpenAI Responses API
- Anthropic Messages API (with `anthropic-dangerous-direct-browser-access` for direct browser CORS)
- DeepSeek Chat Completions API

API keys are entered in the browser and sent directly to the selected provider. They are not stored by the app.

The Model ID input is free-text — paste any current identifier supported by the chosen provider. Model IDs go stale frequently, so verify the name on the provider's docs before each session.

Each generation runs through `runPipeline`: it builds the prompt, calls the chosen provider, runs all validators, and on any failure feeds the failing lines back to the model with the prior attempts (up to 3 iterations) before returning. Lock a line in the result to pin it for the next round.

## Current Limitations

- MIDI input is implemented; audio/humming transcription is planned.
- Melody analysis is heuristic and may need manual phrase edits.
- English syllable counting is approximate for names, slang, and sung elisions.
- No saved projects or account system.
- No vocal synthesis or sing-along playback.

## Reference docs

- `docs/melody_lyrics_tool_PRD.md` — full product requirements.
- `docs/knowledge/singability.md` — curated XAI-Lyricist alignment principles used by the prompt and validators.
- `docs/XAI_LYRICS.pdf` — the original XAI-Lyricist paper (IJCAI-24).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans for shipped features.
