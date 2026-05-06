# Lyrics Navigator — Design

**Date:** 2026-05-06
**Author:** Claude + Tong

## Problem

The current Full Lyrics card sits below the workspace at full page width. After generation it's the densest text on the page, and it's far from the piano roll, so mapping a lyric line back to its melody phrase requires eye-jumping between two separate regions. The wide layout also wastes space — most lines are short enough that a 1000px-wide row is mostly empty.

A separate problem is duplicated interaction surfaces: per-line editing and locking exist both in the Full Lyrics card *and* in the Active Line panel below the piano roll. Two places to do the same thing means two places to keep in sync.

## Goal

Replace the wide Full Lyrics card with a compact **Lyrics Navigator** in the sticky right panel, directly below the Generate bar. The navigator is read-only navigation: clicking a row selects that phrase, which auto-scrolls the piano roll (existing effect) and updates the Active Line panel below the roll (existing wiring). Per-line editing and locking move exclusively to the Active Line panel.

## Non-goals

- Inline lyric strip under the piano roll notes. Considered, deferred — the right-panel navigator solves the navigation problem with less layout risk.
- Karaoke-style syllable alignment under each note. Out of scope.
- Changes to the Active Line panel itself. It already does per-line editing/locking; this design preserves it untouched.
- Changes to `prompt.ts`, `agent.ts`, `validators.ts`, `prosody.ts`, `structure.ts`. Pipeline behavior unchanged.
- Per-row controls in the navigator (no inline edit, no lock toggle, no syllable badge, no play button, no line numbers). Explicitly minimal.

## Approach

A new component `src/components/LyricsNavigator.tsx` renders only when at least one phrase has generated text (`output.some(o => o?.text)`). It lives inside the existing right panel, immediately after the Generate bar's `details.prompt-drawer` block.

**Layout:**

```
┌─ Right panel (sticky) ────────────────────┐
│ Step 3 · Direction textarea               │
│ Style chips                               │
│ Rhyme strategy / strict toggle            │
│ Generate bar                              │
│ View raw prompt (collapsible)             │
│ ─────────────────────────────────────     │
│ Lyrics                  [Copy] [Lock all] │  ← navigator header
│                                           │
│ VERSE 1                                   │  ← section header
│ The morning sun is breaking through       │  ← row
│ New moves, then we glide in circles       │  ← selected row (pink)
│ CHORUS                                    │
│ Hold me close until we fly                │
│ Hold me close until we fly                │
│ VERSE 2                                   │
│ ...                                       │
└───────────────────────────────────────────┘
```

**Section grouping:** consecutive rows with the same `sectionLabels[i]` value share one header rendered above the first row of the run. The component does this explicitly by checking `sectionLabels[i] !== sectionLabels[i-1]` — only the first phrase of a section run gets a header. (The current Full Lyrics card emits the section label per-row and relies on styling to hide duplicates; the new behavior is structurally cleaner.)

**Click behavior:** `onSelectPhrase(phrase.id)` → drives `setSelectedPhraseId` in `App.tsx`. The piano roll's existing `useEffect` (`PianoRoll.tsx:43-53`) scrolls the roll horizontally to bring the phrase into view; the Active Line panel re-keys off `selectedPhraseId`. No new state or effects needed.

**Bulk actions in header:** "Copy all" copies all generated lines as plain text with section headers between groups (same logic as the current card's `Copy all` button). "Lock all" sets `output[i].locked = true` for every populated row (same as today). Both are migrated as-is.

**Empty / partial states:**
- Before any generation (`output.length === 0` or all `o?.text` empty): navigator does not render.
- During streaming: rows render as `output[i].text` populates, in order. Empty entries (not yet streamed, or never generated) render a single muted `(not generated)` placeholder row so the structure is visible. The navigator does not distinguish "currently generating" from "didn't generate" — one placeholder for both states keeps the component simple and matches the way the existing Full Lyrics card behaved.

**Scroll-into-view:** when `selectedPhraseId` changes (via piano roll click, Active Line nav arrows, or the navigator itself), the navigator scrolls the selected row into view inside its own scroll container. Implementation: a `useEffect` on `selectedPhraseId` that runs `rowRef.scrollIntoView({ block: 'nearest' })`.

## Implementation sketch

**New file: `src/components/LyricsNavigator.tsx`**

```tsx
import { Fragment, useEffect, useRef } from 'react';
import type { Phrase, GeneratedLine } from '../types';
import * as I from './Icons';

type Props = {
  phrases: Phrase[];
  output: (GeneratedLine | null)[];
  sectionLabels: string[];
  selectedPhraseId: string | null;
  onSelectPhrase: (id: string) => void;
  onCopyAll: () => void;
  onLockAll: () => void;
};

export function LyricsNavigator({
  phrases, output, sectionLabels, selectedPhraseId,
  onSelectPhrase, onCopyAll, onLockAll,
}: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPhraseId]);

  if (!output.some((o) => o?.text)) return null;

  return (
    <div className="lyrics-nav panel">
      <div className="lyrics-nav-head">
        <h3>Lyrics</h3>
        <div className="row">
          <button type="button" className="btn ghost small" onClick={onCopyAll}>
            <I.copy /> Copy all
          </button>
          <button type="button" className="btn ghost small" onClick={onLockAll}>
            <I.lock /> Lock all
          </button>
        </div>
      </div>
      <div className="lyrics-nav-body">
        {phrases.map((phrase, i) => {
          const sec = sectionLabels[i];
          const prevSec = i > 0 ? sectionLabels[i - 1] : null;
          const showHeader = sec && sec !== prevSec;
          const text = output[i]?.text ?? '';
          const isSelected = phrase.id === selectedPhraseId;
          return (
            <Fragment key={phrase.id}>
              {showHeader && <div className="lyrics-nav-section">{sec}</div>}
              <button
                ref={isSelected ? selectedRef : undefined}
                type="button"
                className={`lyrics-nav-row ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectPhrase(phrase.id)}
              >
                {text || <span className="muted">(not generated)</span>}
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
```

**Edits to `src/App.tsx`:**

1. **Remove** the entire `{output.length > 0 && output.some((o) => o?.text) && (<div className="panel full-lyrics">…</div>)}` block (currently around lines 850–933).

2. **Add** the navigator inside the right panel, after the `details.prompt-drawer` (around line 846, before `</div>` of the right panel container):

   ```tsx
   <LyricsNavigator
     phrases={phrases}
     output={output}
     sectionLabels={sectionLabels}
     selectedPhraseId={selectedPhraseId}
     onSelectPhrase={setSelectedPhraseId}
     onCopyAll={() => {
       const lines = output.map((o, i) => {
         const sec = sectionLabels[i];
         const prevSec = i > 0 ? sectionLabels[i - 1] : null;
         const prefix = sec && sec !== prevSec ? `\n[${sec}]\n` : '';
         return prefix + (o?.text ?? '');
       }).join('\n').trim();
       copyText(lines, 'Lyrics copied.');
     }}
     onLockAll={() => setOutput((o) => o.map((l) => (l ? { ...l, locked: true } : l)))}
   />
   ```

   The two callbacks duplicate the current card's logic (Copy all uses section headers between runs, Lock all maps over output). The Copy-all logic is updated to only emit a section header when the section changes, matching the navigator's display.

3. **Import** the new component at the top of `App.tsx`.

**CSS additions** (location: same stylesheet that defines `.full-lyrics`, likely `src/index.css`):

```css
.lyrics-nav { margin-top: 16px; }
.lyrics-nav-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.lyrics-nav-head h3 { margin: 0; font-family: var(--display); font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft); }
.lyrics-nav-head .row { display: flex; gap: 6px; }
.lyrics-nav-body { max-height: 50vh; overflow-y: auto; padding: 8px 0; }
.lyrics-nav-section { padding: 12px 16px 4px; font-family: var(--display); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
.lyrics-nav-row { display: block; width: 100%; padding: 8px 16px; border: 0; background: transparent; text-align: left; font-family: var(--body); font-size: 14px; color: var(--ink); cursor: pointer; transition: background 120ms; }
.lyrics-nav-row:hover { background: color-mix(in oklab, var(--accent) 6%, transparent); }
.lyrics-nav-row.selected { background: color-mix(in oklab, var(--accent) 14%, transparent); color: var(--ink); }
.lyrics-nav-row .muted { color: var(--ink-soft); font-style: italic; }
```

(Exact tokens and selectors will be tuned during implementation against existing variables; the rules above are illustrative.)

**CSS removals:** delete `.full-lyrics`, `.full-lyrics-body`, `.fl-row`, `.fl-num`, `.fl-text`, `.fl-syl`, `.fl-lock`, `.fl-section` rules. Confirm via grep that nothing else references them; the Active Line panel uses different class names (`.line-editor`, `.slot-row`, etc.).

## Tests

The existing test suite is unit-level (prompt/prosody/structure/validators/locks/vowels/agent). There is no React component test infrastructure. This change is UI-only and does not touch any module under test.

Verification will be:

1. `npm run build` (which runs `tsc --noEmit` then `vite build`) passes — confirms types and module resolution.
2. `npm test` passes — confirms no pipeline regressions.
3. Manual smoke in the dev server:
   - Generate lyrics on a sample melody. Confirm navigator appears in right panel below Generate bar.
   - Confirm Full Lyrics card is gone from below the workspace.
   - Click a row → confirm piano roll scrolls to that phrase, Active Line panel updates.
   - Confirm section headers appear at run boundaries.
   - Click "Copy all" → paste into a text editor → confirm sections separated by `[Section]` headers.
   - Click "Lock all" → confirm Active Line panel shows the selected line as locked, and re-clicking Generate preserves all locked lines.
   - Edit / lock a single line in Active Line → confirm navigator does not show stale text (it reads `output[i].text` so it should auto-update; verify).
   - Streaming: during a slow generation, confirm rows fill in as text streams.

## Edge cases

- **No phrases at all** (before MIDI upload): `output` is empty, `output.some(...)` is `false`, navigator returns null. Safe.
- **Phrases without section labels** (`sectionLabels[i] === ''`): `showHeader` is falsy, no header rendered. Rows still display.
- **Single section spanning all phrases**: one header at the top, all rows below it. Correct.
- **Streaming partial output**: `output[i]` is `null` for un-streamed rows → renders `(not generated)` muted placeholder so the structure is preserved while later rows fill in.
- **User edits a line in Active Line** (which mutates `output[i].text`): the navigator's row text updates on the next render via the `output` prop. No stale state.
- **User locks a line in Active Line**: navigator does not visually distinguish locked rows (per the "minimal" spec — no lock dot). Confirmed acceptable.
- **Right panel taller than viewport**: the navigator body has `max-height: 50vh; overflow-y: auto`, so it scrolls internally without forcing the whole page to scroll. The Generate bar above stays accessible.
- **Selected phrase is offscreen in navigator**: the `useEffect` on `selectedPhraseId` calls `scrollIntoView({ block: 'nearest' })` to bring the row into view inside the navigator's scroll container.
- **Selection driven by piano roll seek** (the change earlier in this session): now propagates to the navigator via `selectedPhraseId`, so clicking the roll, the navigator, or using Active Line nav arrows all keep the three views in sync.

## Risks / mitigations

- **Risk:** the right panel becomes too tall on small viewports once the navigator is added below the Generate bar. *Mitigation:* `max-height: 50vh` on the navigator body, internal scrolling. Generate bar and styles remain visible above the navigator.
- **Risk:** removing the wide Full Lyrics card removes a familiar, easy-to-scan reading surface for users who like to read the whole song in paragraph form. *Mitigation:* Copy all → paste into any editor gets the same artifact. If real-world feedback shows readers want it back, we can add a small "Read full / Print" modal later (out of scope for this spec).
- **Risk:** CSS regression in the right panel's `position: sticky` layout — adding a tall element below could push the panel past the viewport in a way that breaks stickiness. *Mitigation:* the panel itself stays sticky; only the navigator body scrolls. Manual smoke during implementation will catch any layout breakage.
- **Risk:** the Copy-all string format changes subtly (only emit section header at run boundary instead of on every row), which could break a user's expectation. *Mitigation:* the new format is closer to a typical lyric sheet; the old format duplicated section labels on every row of a section, which was already weird. Acceptable change, called out here.

## Success criteria

- Full Lyrics card JSX is removed from `App.tsx` and its CSS is removed from the stylesheet.
- `LyricsNavigator` component renders inside the right panel below the Generate bar when any line has generated text.
- Clicking a navigator row selects the phrase, scrolling the piano roll and updating the Active Line panel — verified manually.
- Section headers appear at section-run boundaries inside the navigator.
- Copy all and Lock all bulk actions work from the navigator's header.
- Selected row is visually highlighted with the pink accent and auto-scrolls into view when selection changes externally.
- `npm run build` and `npm test` pass.
- No edits to `prompt.ts`, `agent.ts`, `validators.ts`, `prosody.ts`, `structure.ts`, `playback.ts`, `midi.ts`, or any test file.
