# Melody to Lyrics

A browser-only songwriting tool that turns a MIDI melody into a prosody-aware lyric prompt or generated lyric draft. The app analyzes melody phrases, syllable counts, stress patterns, line endings, and locked lyric fragments so generated lyrics can scan against the melody instead of fighting it.

## Features

- Upload `.mid` / `.midi` files under 10 MB.
- Parse MIDI with `@tonejs/midi` and select the track with the most notes.
- Show MIDI metadata: track name, tempo, meter, and PPQ.
- Segment melody into lyric phrases and estimate per-note stress.
- Preview the full MIDI or play each phrase/line individually.
- Manually split phrases by clicking note bars and merge adjacent phrases.
- Lock partial lyric content per line with `_` placeholders.
- Count English syllables with `word:N` overrides, such as `fire:1`.
- Build a detailed copyable LLM prompt.
- Generate lyrics in-tool with OpenAI, Anthropic, or DeepSeek API keys.
- Choose curated model IDs, or use a custom model ID for newly released models.
- Validate generated lyrics against locked words.
- Copy lyrics or export a `.txt` file with metadata.

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
6. Fill in theme, mood, genre, POV, rhyme scheme, and other direction fields.
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
- Anthropic Messages API
- DeepSeek Chat Completions API

API keys are entered in the browser and sent directly to the selected provider. They are not stored by the app.

Model choices are curated in the dropdown, with a `Custom model ID` option for newly released or account-specific models.

## Current Limitations

- MIDI input is implemented; audio/humming transcription is planned.
- Melody analysis is heuristic and may need manual phrase edits.
- English syllable counting is approximate for names, slang, and sung elisions.
- No saved projects or account system.
- No vocal synthesis or sing-along playback.

## PRD

The product requirements document lives at:

```text
docs/melody_lyrics_tool_PRD.md
```
