# Lyrics Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wide Full Lyrics card below the workspace with a compact `LyricsNavigator` component inside the sticky right panel (below the Generate bar). Read-only navigation: clicking a row selects the phrase, which auto-scrolls the piano roll and updates the Active Line panel via existing wiring. Bulk Copy-all and Lock-all actions migrate to the navigator's header. Per-line editing/locking remains exclusively in the Active Line panel.

**Architecture:** Two new modules: a pure `src/lyrics-export.ts` helper for the Copy-all string format (TDD'd with vitest), and a `src/components/LyricsNavigator.tsx` presentational component (no test infra in this project for components — verified manually + via type-check). `App.tsx` removes the `panel.full-lyrics` JSX block and renders the navigator inside `.panel-sticky`. CSS in `src/styles.css` swaps the `.full-lyrics`/`.fl-*` rules for `.lyrics-nav`/`.lyrics-nav-*` rules.

**Tech Stack:** TypeScript, React 19, Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-06-lyrics-navigator-design.md`.

**Branching note:** This plan operates directly on `main`. The earlier same-session change (commit `9a79c78` — sync phrase selection on piano-roll seek) is already on `main` and is a useful prereq because it reinforces the single-source-of-truth flow `selectedPhraseId → roll + Active Line + navigator`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lyrics-export.ts` | create | `formatLyricsForCopy(phrases, output, sectionLabels)` — pure helper that returns the Copy-all string with section headers emitted only at section-run boundaries. |
| `src/lyrics-export.test.ts` | create | Unit tests for the helper. |
| `src/components/LyricsNavigator.tsx` | create | Presentational component. Renders section headers + clickable rows; emits `onSelectPhrase` / `onCopyAll` / `onLockAll`. Returns `null` when no output exists. |
| `src/App.tsx` | modify | Remove the `panel.full-lyrics` JSX block (currently around lines 850–933). Insert `<LyricsNavigator … />` inside `.panel-sticky` after the `prompt-drawer` (around line 846). Replace the inline Copy-all logic with a call to `formatLyricsForCopy`. |
| `src/styles.css` | modify | Delete the `.full-lyrics`, `.full-lyrics-body`, `.fl-section`, `.fl-row`, `.fl-num`, `.fl-text`, `.fl-syl`, `.fl-lock` rule blocks (lines 757–857). Add new `.lyrics-nav`, `.lyrics-nav-head`, `.lyrics-nav-body`, `.lyrics-nav-section`, `.lyrics-nav-row` rules. |
| `CLAUDE.md` | modify | Register this plan in the Reference docs section. |

Nothing else is touched. `prompt.ts`, `agent.ts`, `validators.ts`, `prosody.ts`, `structure.ts`, `playback.ts`, `midi.ts`, `types.ts` — all unchanged.

---

## Task 1: TDD `formatLyricsForCopy` helper

**Files:**
- Create: `src/lyrics-export.ts`
- Create: `src/lyrics-export.test.ts`

The current Copy-all logic is inlined in `App.tsx` and emits a section header on every row that has a section label, which produces stutter (e.g., `[Verse 1]\n` repeated four times when a verse has four lines). The new behavior emits a header only at section-run boundaries. We extract this into a pure helper so the behavioral change is unit-testable.

- [ ] **Step 1: Write the failing tests**

Create `src/lyrics-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatLyricsForCopy } from './lyrics-export';
import type { Phrase, GeneratedLine } from './types';

const makePhrase = (id: string): Phrase => ({
  id,
  notes: [],
  syllables: 0,
  stressPattern: '',
  endingDirection: 'level',
  startTime: 0,
  endTime: 0,
});

const line = (text: string, locked = false): GeneratedLine => ({ text, locked, validation: null });

describe('formatLyricsForCopy', () => {
  it('returns empty string when nothing has been generated', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    expect(formatLyricsForCopy(phrases, [null, null], ['', ''])).toBe('');
  });

  it('joins lines with newlines and no headers when there are no section labels', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    const output = [line('one line'), line('two line')];
    expect(formatLyricsForCopy(phrases, output, ['', ''])).toBe('one line\ntwo line');
  });

  it('emits a section header only at the first phrase of each run', () => {
    const phrases = [makePhrase('a'), makePhrase('b'), makePhrase('c'), makePhrase('d')];
    const output = [line('v1 line 1'), line('v1 line 2'), line('chorus 1'), line('chorus 2')];
    const result = formatLyricsForCopy(phrases, output, ['Verse 1', 'Verse 1', 'Chorus', 'Chorus']);
    expect(result).toBe('[Verse 1]\nv1 line 1\nv1 line 2\n\n[Chorus]\nchorus 1\nchorus 2');
  });

  it('treats null output entries as blank rows but preserves structure', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    const output = [line('first'), null];
    expect(formatLyricsForCopy(phrases, output, ['Verse 1', 'Verse 1'])).toBe('[Verse 1]\nfirst\n');
  });

  it('handles a section change between two non-empty rows with a blank line separator before the new header', () => {
    const phrases = [makePhrase('a'), makePhrase('b')];
    const output = [line('a line'), line('b line')];
    expect(formatLyricsForCopy(phrases, output, ['Verse 1', 'Chorus'])).toBe('[Verse 1]\na line\n\n[Chorus]\nb line');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lyrics-export.test.ts`

Expected: fails with "Cannot find module './lyrics-export'" or equivalent.

- [ ] **Step 3: Implement the helper**

Create `src/lyrics-export.ts`:

```ts
import type { GeneratedLine, Phrase } from './types';

export function formatLyricsForCopy(
  phrases: Phrase[],
  output: (GeneratedLine | null)[],
  sectionLabels: string[],
): string {
  if (!output.some((o) => o?.text)) return '';

  const parts: string[] = [];
  let prevSection: string | null = null;

  for (let i = 0; i < phrases.length; i++) {
    const sec = sectionLabels[i] ?? '';
    const text = output[i]?.text ?? '';
    if (sec && sec !== prevSection) {
      if (parts.length > 0) parts.push('');
      parts.push(`[${sec}]`);
    }
    parts.push(text);
    prevSection = sec || prevSection;
  }

  return parts.join('\n');
}
```

Notes:
- `prevSection` only advances when the row has a non-empty section label; this preserves grouping when an unlabeled row appears in the middle of a labeled run (rare but possible if a user manually clears one label).
- A blank-line separator is emitted *before* a new header when the file already has content. This produces:
  ```
  [Verse 1]
  v1 line 1
  v1 line 2

  [Chorus]
  chorus 1
  ```
  (matches the test in step 1 case 3).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lyrics-export.test.ts`

Expected: all 5 tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lyrics-export.ts src/lyrics-export.test.ts
git commit -m "$(cat <<'EOF'
Add formatLyricsForCopy helper

Pure helper that builds the Copy-all string with section headers
emitted only at section-run boundaries (instead of per-row, which
was the existing card's behavior). Will replace the inlined logic
in App.tsx when the Lyrics Navigator lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `LyricsNavigator` component

**Files:**
- Create: `src/components/LyricsNavigator.tsx`

This is a presentational component. There is no React Testing Library setup in this project — all existing tests are unit-level on pure modules. We rely on type-check + manual smoke for the component's behavior, and on Task 1's tests for the Copy-all logic it ultimately drives.

- [ ] **Step 1: Create the component file**

Create `src/components/LyricsNavigator.tsx`:

```tsx
import { Fragment, useEffect, useRef } from 'react';
import type { GeneratedLine, Phrase } from '../types';
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
  phrases,
  output,
  sectionLabels,
  selectedPhraseId,
  onSelectPhrase,
  onCopyAll,
  onLockAll,
}: Props) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPhraseId]);

  if (!output.some((o) => o?.text)) return null;

  return (
    <div className="lyrics-nav panel">
      <div className="lyrics-nav-head">
        <h3>Lyrics</h3>
        <div className="row">
          <button type="button" className="btn ghost small" onClick={onCopyAll} title="Copy all lyrics to clipboard">
            <I.copy /> Copy all
          </button>
          <button type="button" className="btn ghost small" onClick={onLockAll} title="Lock every line">
            <I.lock /> Lock all
          </button>
        </div>
      </div>
      <div className="lyrics-nav-body">
        {phrases.map((phrase, i) => {
          const sec = sectionLabels[i] ?? '';
          const prevSec = i > 0 ? (sectionLabels[i - 1] ?? '') : '';
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors. (Type errors at this stage are most likely a missing import or a type mismatch in `Icons` — confirm `I.copy` and `I.lock` are exported from `src/components/Icons.tsx`.)

If `I.copy` or `I.lock` is not exported, list available icons:
```bash
grep -n "^export\|export const\|export function" src/components/Icons.tsx
```
And use whichever `copy` / `lock` icons are exported. (The Full Lyrics card already uses `I.copy` and `I.lock`, so they should exist.)

- [ ] **Step 3: Commit**

```bash
git add src/components/LyricsNavigator.tsx
git commit -m "$(cat <<'EOF'
Add LyricsNavigator component

Read-only overview of generated lyrics for the right panel. Section
headers at run boundaries; clicking a row emits onSelectPhrase.
Copy-all / Lock-all bulk actions live in the header.

Not yet wired into App.tsx — that's the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `LyricsNavigator` into `App.tsx` and remove the Full Lyrics card

**Files:**
- Modify: `src/App.tsx`

This task does three things in one commit because they are inseparable: the navigator goes in, the card comes out, and the Copy-all callback is replaced. Any partial state would leave the UI in a broken intermediate.

- [ ] **Step 1: Add the import**

At the top of `src/App.tsx`, alongside the existing component imports, add:

```ts
import { LyricsNavigator } from './components/LyricsNavigator';
import { formatLyricsForCopy } from './lyrics-export';
```

(Place near `import { PianoRoll } from './components/PianoRoll';` and similar — match the project's existing import grouping.)

- [ ] **Step 2: Insert the navigator inside `.panel-sticky`**

Find the closing of the right panel — the line `</div>` that closes `<div className="panel panel-sticky">` (currently around line 847, immediately after the `</details>` of `prompt-drawer`).

Replace this snippet:

```tsx
                <details className="prompt-drawer" open={tweaks.showPrompt}>
                  <summary>
                    <span>View raw prompt</span>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={(e) => { e.preventDefault(); copyText(prompt, 'Prompt copied.'); }}
                    ><I.copy /> Copy</button>
                  </summary>
                  <pre>{prompt}</pre>
                </details>
              </div>
            </div>
```

With:

```tsx
                <details className="prompt-drawer" open={tweaks.showPrompt}>
                  <summary>
                    <span>View raw prompt</span>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={(e) => { e.preventDefault(); copyText(prompt, 'Prompt copied.'); }}
                    ><I.copy /> Copy</button>
                  </summary>
                  <pre>{prompt}</pre>
                </details>

                <LyricsNavigator
                  phrases={phrases}
                  output={output}
                  sectionLabels={sectionLabels}
                  selectedPhraseId={selectedPhraseId}
                  onSelectPhrase={setSelectedPhraseId}
                  onCopyAll={() => copyText(formatLyricsForCopy(phrases, output, sectionLabels), 'Lyrics copied.')}
                  onLockAll={() => setOutput((o) => o.map((l) => (l ? { ...l, locked: true } : l)))}
                />
              </div>
            </div>
```

The navigator sits inside the `.panel-sticky` so it scrolls with the right panel and benefits from the same sticky behavior.

- [ ] **Step 3: Remove the Full Lyrics card**

Find the block beginning with `{/* Full lyrics card */}` (currently around line 850) and ending with the closing `</div>` of `<div className="panel full-lyrics">` (around line 933). Delete the entire block:

```tsx
            {/* Full lyrics card */}
            {output.length > 0 && output.some((o) => o?.text) && (
              <div className="panel full-lyrics">
                {/* …all of its contents… */}
              </div>
            )}
```

After deletion, the structural neighbor below should be `</main>` (around line 936).

- [ ] **Step 4: Check for unused imports / state**

Run:
```bash
grep -n "Fragment\|countSyllables\|copyText" src/App.tsx | head -10
```

The Full Lyrics card was the only consumer of `Fragment` and `countSyllables` outside the per-line editor; the Active Line panel may also use them. If grep shows no remaining usage of `Fragment`, remove it from the React import. If `countSyllables` is now unused, remove its import.

(`copyText` is still used by the prompt-drawer Copy button and the new `onCopyAll` callback — keep it.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors. If TypeScript complains about an unused import that you removed in step 4, that's expected — fix as guided. If it complains about something else (a type mismatch in the navigator props, missing field in `output` shape), re-read the prop types in `LyricsNavigator.tsx` against the call site.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all tests pass, including the new `formatLyricsForCopy` tests from Task 1. No existing test should break — the pipeline modules are untouched.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
Wire LyricsNavigator into right panel; remove Full Lyrics card

The wide Full Lyrics card below the workspace is replaced by a
compact LyricsNavigator inside the sticky right panel, immediately
below the Generate bar. Read-only navigation: clicking a row drives
selectedPhraseId, which the existing wiring already uses to scroll
the piano roll and update the Active Line panel.

Bulk Copy-all and Lock-all migrate to the navigator header. Per-line
editing and locking now live exclusively in the Active Line panel
(no behavior change there — the card was a duplicate surface).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Replace `.full-lyrics` styles with `.lyrics-nav` styles

**Files:**
- Modify: `src/styles.css`

The old card's CSS (~100 lines) is dead code after Task 3. The navigator needs its own styles. Done as a separate commit because it's a self-contained CSS swap.

- [ ] **Step 1: Delete the dead `.full-lyrics` block**

In `src/styles.css`, delete lines 757–857 (the entire `Full lyrics card` section, from the `/* ===…=== Full lyrics card …=== */` comment through the closing of `.fl-lock svg`). Verify the deletion left no orphaned selectors:

```bash
grep -n "full-lyrics\|fl-row\|fl-num\|fl-text\|fl-syl\|fl-lock\|fl-section" src/styles.css
```

Expected: no output (zero matches).

- [ ] **Step 2: Add the navigator styles**

Insert this block where the deleted `Full lyrics card` block used to be (preserves the file's section ordering):

```css
/* ========================================================
   Lyrics navigator (right-panel)
======================================================== */
.lyrics-nav {
  margin-top: 18px;
}
.lyrics-nav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.lyrics-nav-head h3 {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--accent);
}
.lyrics-nav-head .row { display: inline-flex; gap: 6px; }
.lyrics-nav-body {
  max-height: 50vh;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
}
.lyrics-nav-section {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--accent);
  padding: 12px 16px 4px;
}
.lyrics-nav-section:first-child { padding-top: 4px; }
.lyrics-nav-row {
  display: block;
  width: 100%;
  padding: 8px 16px;
  border: 0;
  background: transparent;
  text-align: left;
  font-family: var(--display);
  font-size: 15px;
  line-height: 1.35;
  color: var(--ink);
  letter-spacing: -0.005em;
  cursor: pointer;
  transition: background 120ms;
}
.lyrics-nav-row:hover {
  background: color-mix(in oklab, var(--accent) 6%, transparent);
}
.lyrics-nav-row.selected {
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  outline: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
}
.lyrics-nav-row .muted {
  color: var(--ink-faint);
  font-style: italic;
}
```

The values mirror the existing card's typography choices (mono section labels, display-font lines, accent highlight via `color-mix`) so the navigator feels native to the project's editorial theme.

- [ ] **Step 2.5: Verify CSS variables exist**

The styles above reference `--ink-faint`. Confirm it's defined:

```bash
grep -n "ink-faint\|--ink-muted" src/styles.css | head -5
```

If `--ink-faint` is not defined, replace its use in the `.lyrics-nav-row .muted` rule with `--ink-muted` (which is definitely defined — it's used by `.fl-lock` and elsewhere). Pick whichever the project already uses for "even-fainter-than-muted" text.

- [ ] **Step 3: Type-check + build (CSS doesn't compile, but the build step catches CSS reference issues)**

Run: `npm run build`

Expected: clean build. Any unused-class warning is fine; we only care that the build itself completes without error.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "$(cat <<'EOF'
Replace .full-lyrics styles with .lyrics-nav for the navigator

CSS-only swap: deletes the dead Full Lyrics card rules and adds
matching styles for the new LyricsNavigator (sticky right-panel
overview). Typography mirrors the editorial theme used by the
prior card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual smoke + final verification + register plan in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all tests pass. New count: existing baseline + 5 new tests in `lyrics-export.test.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: clean Vite build.

- [ ] **Step 4: Browser smoke**

Start the dev server:

```bash
npm run dev
```

Open http://127.0.0.1:5173/.

Walk through this checklist:

1. Click "Try a sample melody" → confirm Step 2 (piano roll) and Step 3 (right panel) show. Navigator should NOT yet be visible (no output).
2. Click "Generate lyrics" with whatever model is configured (or stub by typing into the Active Line below the roll — but a real generation is the truer test).
3. Confirm the **Lyrics Navigator** appears inside the right panel, immediately below the Generate bar / "View raw prompt" drawer.
4. Confirm the **Full Lyrics card** is gone from below the workspace.
5. Click a row in the navigator → confirm:
   - The piano roll scrolls horizontally to that phrase.
   - The Active Line panel below the roll updates to that phrase.
   - The clicked row is visually highlighted in pink.
6. Click in the piano roll background to seek mid-song → confirm the navigator's selected row updates to match (this exercises the prereq from commit `9a79c78`).
7. Click "Copy all" in the navigator header → paste into a text editor → confirm format is `[Verse 1]\nline\nline\n\n[Chorus]\nline\n…` (section headers only at run boundaries, blank line between sections).
8. Click "Lock all" → confirm Active Line panel shows the current line as locked, and a re-Generate preserves all lines verbatim.
9. Resize the browser narrow enough to overflow the right panel: confirm the navigator body scrolls internally (max-height 50vh) without breaking the sticky panel layout. The Generate bar above stays visible.
10. Edit a line in the Active Line panel — confirm the navigator's row text updates to match (it reads `output[i].text` so this is automatic).

If any step fails, fix and re-run. Common fixes:
- Selected-row highlight doesn't show → check `.lyrics-nav-row.selected` is in CSS and the JSX uses `className="lyrics-nav-row selected"` not `selected`-only.
- Click doesn't propagate to piano roll scroll → ensure `onSelectPhrase` receives `phrase.id` and the existing PianoRoll effect at `src/components/PianoRoll.tsx:43-53` is intact.
- Copy-all output is wrong → re-run `npx vitest run src/lyrics-export.test.ts -t "section header"`.

- [ ] **Step 5: Register the plan in CLAUDE.md**

Open `CLAUDE.md`. Find the line:
```
- `docs/superpowers/specs/2026-05-06-lyrics-navigator-design.md` — design doc for the right-panel lyrics navigator (replaces the wide Full Lyrics card).
```

Add a plan entry directly below it:
```markdown
- `docs/superpowers/plans/2026-05-06-lyrics-navigator.md` — implementation plan for the right-panel lyrics navigator.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Register lyrics-navigator plan in CLAUDE.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Final review**

```bash
git log --oneline -8
```

Expected commits, in order (most recent first):
1. Register lyrics-navigator plan in CLAUDE.md
2. Replace .full-lyrics styles with .lyrics-nav for the navigator
3. Wire LyricsNavigator into right panel; remove Full Lyrics card
4. Add LyricsNavigator component
5. Add formatLyricsForCopy helper
6. (older) Register lyrics-navigator spec in CLAUDE.md
7. (older) Add lyrics-navigator design doc
8. (older) Sync phrase selection to playhead on piano-roll seek

Five commits for this plan, atomic by responsibility. Don't push or open a PR unless asked.

---

## Self-review checklist

- [x] **Spec coverage:**
  - §"Layout" (navigator inside `.panel-sticky` below Generate bar) → Task 3 step 2.
  - §"Section grouping" (`sec !== prevSec`) → Task 2 component + Task 1 helper.
  - §"Click behavior" (drives `setSelectedPhraseId` only) → Task 3 step 2 prop wiring.
  - §"Bulk actions in header" (Copy all + Lock all) → Task 2 component header + Task 3 step 2 callbacks.
  - §"Empty / partial states" (component returns null when no output; muted placeholder rows) → Task 2 component logic + Task 1 test for null entries.
  - §"Scroll-into-view" (`scrollIntoView` on selectedPhraseId change) → Task 2 component effect.
  - §"Files touched" (App.tsx, styles.css, new component) → Tasks 2/3/4.
  - §"Removed" (Full Lyrics card JSX + CSS) → Task 3 step 3 + Task 4 step 1.
  - §Tests (only the helper has unit tests; component is manual) → Task 1 (helper TDD), Task 5 step 4 (manual checklist).
  - §Risks ("max-height: 50vh; internal scroll") → Task 4 step 2 CSS.
  - §"Selected row scrolled into view inside the navigator" → Task 5 step 4 item 5/6 manual check.

- [x] **Placeholder scan:** Every task has complete code blocks. No "fill in details" or "implement appropriate handling".

- [x] **Type consistency:**
  - `formatLyricsForCopy(phrases: Phrase[], output: (GeneratedLine | null)[], sectionLabels: string[]): string` — same signature in helper file (Task 1 step 3), test file (Task 1 step 1), and call site (Task 3 step 2).
  - `LyricsNavigator` props `phrases / output / sectionLabels / selectedPhraseId / onSelectPhrase / onCopyAll / onLockAll` — same names in component definition (Task 2 step 1) and call site (Task 3 step 2).
  - `output` is `(GeneratedLine | null)[]` consistently — matches `App.tsx`'s existing `output` state type.

- [x] **Branch parent:** `main`. Plan operates directly. The only same-session prerequisite is commit `9a79c78` (already on `main`) which makes piano-roll seeks update `selectedPhraseId` — useful but not strictly required for the navigator to work.

- [x] **No file size concerns:**
  - `lyrics-export.ts` ~25 lines.
  - `lyrics-export.test.ts` ~50 lines.
  - `LyricsNavigator.tsx` ~70 lines.
  - `App.tsx` net delta: -~85 lines (card removed) + ~12 lines (navigator usage + imports) = roughly -73 lines. App.tsx gets *smaller*.
  - `styles.css`: net delta near zero (replace ~100 lines of `.fl-*` with ~70 lines of `.lyrics-nav-*`).

- [x] **TDD honesty:** the only TDD'd code is the pure helper (Task 1). The component (Task 2) is verified by type-check + manual smoke (Task 5 step 4) because this project does not have React Testing Library. This is called out explicitly in the architecture summary at the top.
