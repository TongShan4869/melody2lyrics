# Chorus-Repetition Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-line `(repeat A)` annotations to the LLM prompt — derived from `detectClusters` — so the model can produce intentional structural repetition (chorus, hook) instead of incidental random duplicates.

**Architecture:** Pure prompt-template change in `src/prompt.ts`. Reuse `detectClusters()` from `src/structure.ts` (no changes there). Compute cluster letters once per `buildPrompt` call, splice into each line header, and add one new rule to the `RULES` block.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-03-chorus-repetition-design.md`.

**Branch parent:** This work depends on the prompt template introduced by PR #2 (`prosody-singability`), specifically `compoundProsody` and the `PROSODY PRINCIPLES` block + the new `RULES` numbering. Task 0 rebases this branch onto `prosody-singability` so the engineer is editing the post-PR-#2 version of `src/prompt.ts`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/prompt.ts` | modify | Add `clusterTags()` helper; splice `(repeat X)` into per-line header inside `buildPrompt`; add new `RULES` rule 8 (renumber 8→9, 9→10). |
| `src/prompt.test.ts` | modify | Unit tests for `clusterTags` + integration tests for the prompt-header annotation and the new rule. |

Nothing else is touched. `structure.ts`, `validators.ts`, `prosody.ts`, `types.ts`, `App.tsx` — all unchanged.

---

## Task 0: Rebase branch onto prosody-singability

**Files:** none (workflow only)

The `chorus-repetition` branch currently sits on `main`. The implementation needs the post-PR-#2 version of `src/prompt.ts`. Rebase to pick up PR #2's prompt template work.

- [ ] **Step 1: Confirm starting state**

```bash
git checkout chorus-repetition
git log --oneline -5
```

Expected: top commit is `df10fd1 Add chorus-repetition hint design doc + gitignore Playwright artifacts`. Below it the head of `main`.

- [ ] **Step 2: Rebase onto prosody-singability**

```bash
git rebase prosody-singability
```

Expected: clean rebase (the only commit on this branch touches `docs/superpowers/specs/...` and `.gitignore` — no overlap with PR #2's source changes).

- [ ] **Step 3: Verify**

```bash
git log --oneline -8
grep -n "compoundProsody\|PROSODY PRINCIPLES" src/prompt.ts | head -5
```

Expected:
- `git log` shows `df10fd1` on top of all PR #2 commits.
- `grep` shows `compoundProsody` is exported and `PROSODY PRINCIPLES` appears in the prompt template — confirming we're now editing the post-PR-#2 file.

If grep returns nothing, the rebase didn't pick up PR #2's changes — STOP and check `git log --all --oneline` to find PR #2's branch tip.

---

## Task 1: `clusterTags` helper

**Files:**
- Modify: `src/prompt.ts`
- Modify: `src/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `src/prompt.test.ts`, after the existing `'prompt builder'` block (anywhere before the `buildRevisionPrompt` block):

```ts
describe('clusterTags', () => {
  const makePhrase = (id: string, durations: number[], pitches: number[]): Phrase => ({
    id,
    notes: durations.map((d, i) => ({
      id: `${id}-n${i}`, midi: pitches[i] ?? 60, pitch: 'C4', time: i, duration: d, velocity: 0.8,
      stressScore: 0.5, stress: 'w', length: 'S',
    })),
    syllables: durations.length,
    stressPattern: '',
    endingDirection: 'level',
    startTime: 0,
    endTime: 0,
  });

  it('returns null for every phrase when nothing clusters', () => {
    const a = makePhrase('a', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b = makePhrase('b', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    expect(clusterTags([a, b])).toEqual([null, null]);
  });

  it('assigns A to a cluster of two', () => {
    const a = makePhrase('a', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b = makePhrase('b', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const c = makePhrase('c', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    expect(clusterTags([a, b, c])).toEqual(['A', 'A', null]);
  });

  it('assigns A and B to two distinct repeating clusters', () => {
    const a1 = makePhrase('a1', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b1 = makePhrase('b1', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    const a2 = makePhrase('a2', [0.5, 0.5, 0.5, 0.5], [60, 64, 67, 72]);
    const b2 = makePhrase('b2', [1.0, 0.25, 0.25, 1.0], [72, 67, 64, 60]);
    expect(clusterTags([a1, b1, a2, b2])).toEqual(['A', 'B', 'A', 'B']);
  });

  it('returns empty array for empty input', () => {
    expect(clusterTags([])).toEqual([]);
  });
});
```

Also update the import at the top of the file to include `clusterTags`:

```ts
import { buildPrompt, buildRevisionPrompt, clusterTags, compoundProsody, rhymeLabels, rhythmProfile, sectionRhymeLabels, sectionRhymePlan } from './prompt';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/prompt.test.ts`
Expected: fails with `'clusterTags' is not exported`.

- [ ] **Step 3: Implement `clusterTags`**

In `src/prompt.ts`, add the import for `detectClusters` if not present, and add the helper export. Place it next to `compoundProsody` (around line 150-160 area).

Add to imports (top of file):
```ts
import { detectClusters } from './structure';
```

Add the helper:
```ts
export function clusterTags(phrases: Phrase[]): (string | null)[] {
  const ids = detectClusters(phrases);
  const sizes = new Map<number, number>();
  for (const id of ids) sizes.set(id, (sizes.get(id) ?? 0) + 1);

  const letters = new Map<number, string>();
  let nextChar = 65; // 'A'
  for (const id of ids) {
    if ((sizes.get(id) ?? 0) >= 2 && !letters.has(id)) {
      letters.set(id, String.fromCharCode(nextChar++));
    }
  }

  return ids.map((id) => letters.get(id) ?? null);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/prompt.test.ts`
Expected: all tests pass, including the 4 new `clusterTags` tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/prompt.ts src/prompt.test.ts
git commit -m "$(cat <<'EOF'
Add clusterTags helper for chorus-repetition hint

Computes per-phrase repeat labels (A, B, C...) based on detectClusters
output. Singletons get null; clusters of size >= 2 get a letter in
first-appearance order. Pure helper — no callers yet; wiring into
buildPrompt lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire `(repeat X)` into the per-line header + add new RULES rule

**Files:**
- Modify: `src/prompt.ts`
- Modify: `src/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to the existing `describe('prompt builder', ...)` block in `src/prompt.test.ts`, after the existing `'includes lyric quality guardrails'` test:

```ts
it('annotates clustered phrases with (repeat X) in the line header', () => {
  // Two identical phrases (same pitches, same durations) should cluster as A.
  const repeatedPhrase: Phrase = {
    ...phrase,
    id: 'phrase-2',
    notes: phrase.notes.map((n, i) => ({ ...n, id: `m${i}` })),
  };
  const lock2: PhraseLockState = { ...lock, phraseIndex: 1 };

  const prompt = buildPrompt([phrase, repeatedPhrase], [lock, lock2], { ...context, rhymeScheme: 'SECTION' }, ['Chorus', 'Chorus']);

  // Both lines carry (repeat A), no (repeat B).
  const repeatA = prompt.match(/\(repeat A\)/g) ?? [];
  expect(repeatA).toHaveLength(2);
  expect(prompt).not.toContain('(repeat B)');

  // The tag appears between the section label and the dash before "syllables".
  expect(prompt).toMatch(/Line 1 \[Chorus\] \(repeat A\) - \d+ syllables/);
  expect(prompt).toMatch(/Line 2 \[Chorus\] \(repeat A\) - \d+ syllables/);
});

it('omits the repeat tag for singleton clusters', () => {
  const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);
  expect(prompt).not.toContain('(repeat');
});

it('includes the chorus-repetition rule in the RULES block', () => {
  const prompt = buildPrompt([phrase], [lock], { ...context, rhymeScheme: 'SECTION' }, ['Chorus']);
  expect(prompt).toContain('8. Lines sharing a `repeat');
  expect(prompt).toMatch(/share an identical melody/);
  // Old rule 9 ("Do not add explanations before or after the lyrics.") should now be rule 10.
  expect(prompt).toContain('10. Do not add explanations before or after the lyrics.');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/prompt.test.ts`
Expected: the new tests fail (no `(repeat A)` in prompt; no rule 8 about repeat; rule 9 still says "Do not add explanations").

- [ ] **Step 3: Wire `clusterTags` into the per-line header**

In `src/prompt.ts`, inside `buildPrompt`, find the existing `phrases.map((phrase, index) => { ... })` block. Compute the tags before the map and inject the annotation into the header.

Above the map, add (right after `const lines = phrases.map(...)` but as a separate `const` *before* the map):

```ts
const tags = clusterTags(phrases);
```

Inside the map callback, modify the header construction. The current header is:
```ts
const header = `Line ${index + 1} ${section}${rhyme}- ${phrase.syllables} syllables, prosody = ${prosody}, ends ${phrase.endingDirection}`;
```

Change to:
```ts
const repeatTag = tags[index] ? `(repeat ${tags[index]}) ` : '';
const header = `Line ${index + 1} ${section}${repeatTag}${rhyme}- ${phrase.syllables} syllables, prosody = ${prosody}, ends ${phrase.endingDirection}`;
```

(The tag goes between `section` and `rhyme` so a section-rhyme line reads `[Chorus 1] (repeat A) (rhyme: A) - ...`.)

- [ ] **Step 4: Add the new RULES rule and renumber**

In `src/prompt.ts`, find the `RULES` block in the `buildPrompt` return template literal. The current block ends with rules 8 and 9:

```
8. ${sectionRhymeMode ? 'For each section, silently choose a specific rhyme family before writing, then keep that section sonically connected without reusing the same final word.' : 'Follow rhyme labels within each section through rhyme families: lines with the same label should feel sonically connected, but should not reuse the same final word.'}
9. Do not add explanations before or after the lyrics.
```

Insert the new rule 8 *before* the existing rule 8, and renumber the existing 8 → 9 and 9 → 10:

```
8. Lines sharing a \`repeat X\` tag share an identical melody. Treat them as a single hook — reuse the same lyric verbatim (or with one small variation, like a final-line "twist") unless the section labels suggest contrasting verses, in which case vary the lyric while keeping the prosody.
9. ${sectionRhymeMode ? 'For each section, silently choose a specific rhyme family before writing, then keep that section sonically connected without reusing the same final word.' : 'Follow rhyme labels within each section through rhyme families: lines with the same label should feel sonically connected, but should not reuse the same final word.'}
10. Do not add explanations before or after the lyrics.
```

(The backticks around `repeat X` are escaped because the surrounding template literal uses backticks. Use `\`repeat X\`` in the source.)

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: all tests pass, including the 3 new prompt builder tests AND the 4 `clusterTags` tests from Task 1. The existing principles-block snapshot test must still pass — the `PROSODY PRINCIPLES` block is unchanged.

If the principles-block snapshot fails, do NOT update the snapshot — investigate why your changes affected it (you should not have edited the principles block).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/prompt.ts src/prompt.test.ts
git commit -m "$(cat <<'EOF'
Annotate clustered phrases with (repeat X) and explain the convention

Per-line headers now carry a (repeat A) tag whenever the phrase belongs
to a cluster of size >= 2. New RULES rule 8 tells the LM that same-tag
lines share a melody and should typically share a hook lyric, with a
permissive caveat for verse-style variation. Rules 9 and 10 are the
former rules 8 and 9, renumbered.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: CLAUDE.md Reference docs update

**Files:**
- Modify: `CLAUDE.md`

The new spec and plan files should be listed alongside the prosody-singability docs in the `## Reference docs` section. Bundle this with the implementation rather than as a separate commit.

- [ ] **Step 1: Update Reference docs section**

Open `CLAUDE.md`. Find the `## Reference docs` section (added by PR #2's Task 3). Add two new lines for the chorus-repetition docs, placed right after the singability ones to keep chronological order:

```markdown
- `docs/superpowers/specs/2026-05-03-chorus-repetition-design.md` — design doc for the chorus-repetition prompt hint.
- `docs/superpowers/plans/2026-05-03-chorus-repetition.md` — implementation plan for the chorus-repetition prompt hint.
```

The `## Reference docs` section after the edit should contain (in order):
1. `README.md`
2. `docs/melody_lyrics_tool_PRD.md`
3. agentic-pipeline spec
4. agentic-pipeline plan
5. prosody-singability spec
6. prosody-singability plan
7. **`docs/superpowers/specs/2026-05-03-chorus-repetition-design.md`** (NEW)
8. **`docs/superpowers/plans/2026-05-03-chorus-repetition.md`** (NEW)
9. `docs/knowledge/singability.md`
10. `docs/XAI_LYRICS.pdf`

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
Register chorus-repetition spec + plan in CLAUDE.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Final verification

**Files:** none (verification + push)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass. Count: 78 (PR #2 baseline) + 4 (Task 1) + 3 (Task 2) = **85 passing**.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean Vite build.

- [ ] **Step 4: Browser smoke test**

Start the dev server and open the app:

```bash
npm run dev
```

In a browser at http://127.0.0.1:5173/, click "Try a sample melody". Click "View raw prompt". The sample melody has 2 phrases — the prompt should NOT show a `(repeat A)` annotation (the two sample phrases are distinct enough to not cluster, OR they cluster but get a tag — either way, document what you observe).

For a stronger smoke test, use the browser console to construct a synthetic 5-phrase MIDI (see `docs/superpowers/specs/2026-05-03-chorus-repetition-design.md` §"Success criteria" for the shape) and confirm the prompt shows `(repeat A)` on the two clustered phrases.

If you have an OpenAI API key, run an end-to-end generation and inspect whether the model produced an intentional refrain on the clustered lines. Optional but recommended.

- [ ] **Step 5: Push branch and open PR**

```bash
git push -u origin chorus-repetition
gh pr create --base main --title "Add chorus-repetition prompt hint" --body "$(cat <<'EOF'
## Summary
- Adds a `(repeat A)` annotation to per-line prompt headers whenever the phrase belongs to a cluster of size >= 2 (via the existing `detectClusters`).
- Adds RULES rule 8 explaining the convention: same-tag lines share a melody, treat as a shared hook unless section labels suggest verse-style variation.
- No changes outside `src/prompt.ts`, `src/prompt.test.ts`, and `CLAUDE.md` Reference docs.

Spec: `docs/superpowers/specs/2026-05-03-chorus-repetition-design.md`
Plan: `docs/superpowers/plans/2026-05-03-chorus-repetition.md`

**Depends on PR #2 (`prosody-singability`).** Please merge PR #2 first; this branch is currently based on `prosody-singability` and will rebase cleanly onto `main` after PR #2 lands.

## Test plan
- [x] `npm test` — 85/85 passing (78 baseline + 7 new).
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` clean.
- [x] Browser smoke: synthetic 5-phrase MIDI shows `(repeat A)` on the two clustered phrases in the rendered raw prompt.
- [ ] LLM-side generation on a clustered melody — optional, requires an API key.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note: when PR #2 merges first, the GitHub PR target will need to be retargeted from `prosody-singability` to `main` (or this branch rebased onto fresh `main`). `gh pr create --base main` already targets main, so this is set up correctly — you just need to ensure the branch is rebased before merge.

---

## Self-review checklist

- [x] **Spec coverage:**
  - §Goal ("surface detectClusters output via repeat tag") → Tasks 1 + 2.
  - §Approach (clusterTags helper) → Task 1.
  - §Approach (header injection) → Task 2 step 3.
  - §"New rule wording" → Task 2 step 4.
  - §Tests requirement → Task 1 step 1 (4 tests) + Task 2 step 1 (3 tests).
  - §Edge cases (empty, singleton, multiple clusters) → covered by Task 1 tests + Task 2 singleton test.
- [x] **Placeholder scan:** all code blocks complete, no TBDs.
- [x] **Type consistency:** `clusterTags(phrases: Phrase[]): (string | null)[]` used identically in helper definition and tests. `detectClusters` import path matches existing codebase pattern.
- [x] **Branch parent:** Task 0 explicitly rebases onto `prosody-singability` so the rest of the plan operates on the post-PR-#2 file.
- [x] **No file size concerns:** changes add ~30 lines to `prompt.ts` (helper + import + header tweak + 1 rule line), ~70 lines to `prompt.test.ts` (1 helper describe + 3 buildPrompt tests). Both files remain focused.
