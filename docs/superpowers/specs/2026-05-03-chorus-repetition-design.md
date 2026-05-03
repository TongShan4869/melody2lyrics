# Chorus-Repetition Hint — Design

**Date:** 2026-05-03
**Author:** Claude + Tong
**Branches off:** `prosody-singability` (PR #2 — depends on its prompt template work)

## Problem

The current pipeline treats every section as needing distinct lyrics, even when two sections are *structurally the same chorus*. In testing on a 5-phrase song where Phrase 1 and Phrase 3 had identical melody, the model:

- Labeled them `Chorus 1` and `Chorus 2` (correct — they came from the same `detectClusters` group).
- Then duplicated Line 1's lyric verbatim into Line 3, anyway.

That's *accidentally* the right behavior (the chorus *should* repeat) but the model arrived at it without understanding the structural reason. On a longer song with a non-chorus repeating cluster, the same opaque process would produce random duplicates that hurt the song.

The fix is to **tell the model when phrases share a melody** so it can decide intentionally whether to repeat the lyric (typical for choruses, hooks, refrains) or vary it (typical for verses with the same tune).

## Goal

Surface `detectClusters` output to the LLM via a `repeat:<letter>` tag on lines whose phrase belongs to a cluster of size ≥ 2. Add one prompt rule explaining the convention. Let the model decide whether to share or vary the lyric per cluster.

## Non-goals

- Programmatic lyric copying ("chorus-lock"). Out of scope; `pinnedLines` already exists for users who want to force repetition.
- UI affordances for marking sections as same chorus. Deferred.
- Validator changes. The new tag is purely a hint to the LLM, not a checked constraint.
- Changing the existing similarity threshold or section-labeling heuristic in `structure.ts`. Both are reused as-is.

## Approach

`buildPrompt` (in `src/prompt.ts`) calls `detectClusters(phrases)` once to get a `number[]` of cluster IDs. For each line:

- If its phrase's cluster has size ≥ 2, emit a `(repeat A)` annotation in the line header. Letters are assigned in the order clusters first appear (skipping singleton clusters).
- If its cluster has size 1, no annotation.

A new rule is added to the `RULES` block telling the model how to interpret the tag.

The tag goes between the `[Section]` label and the syllable count, e.g.:

```
Line 1 [Chorus 1] (repeat A) - 8 syllables, prosody = <strong,short>-...-<strong,long>, ends falling
Line 2 [Verse 1] - 10 syllables, prosody = ..., ends falling
Line 3 [Chorus 2] (repeat A) - 8 syllables, prosody = <strong,short>-...-<strong,long>, ends falling
```

## New rule wording

Inserted into the `RULES` block as rule 8 (renumbering existing rule 8 → 9 etc.):

```
8. Lines sharing a `repeat X` tag share an identical melody. Treat them as a single hook —
   reuse the same lyric verbatim (or with one small variation, like a final-line "twist")
   unless the section labels suggest contrasting verses, in which case vary the lyric while
   keeping the prosody.
```

This is *permissive*: the model can repeat or vary, but now it has a structural signal to base the decision on.

## Implementation sketch

**File: `src/prompt.ts`**

Add helper:

```ts
function clusterTags(phrases: Phrase[]): (string | null)[] {
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

In `buildPrompt`, compute `tags = clusterTags(phrases)` once. In the `phrases.map`, splice the tag into the header:

```ts
const repeatTag = tags[index] ? `(repeat ${tags[index]}) ` : '';
const header = `Line ${index + 1} ${section}${repeatTag}- ${phrase.syllables} syllables, prosody = ${prosody}, ends ${phrase.endingDirection}`;
```

Add new rule 8 in the `RULES` block (renumber 8→9, 9→10).

`buildRevisionPrompt` already calls `buildPrompt` for the prefix, so it picks up the tags automatically. The per-failure detail block doesn't need cluster info (failures are per-line mechanical issues).

## Tests

In `src/prompt.test.ts`:

1. **Clustered phrases get `(repeat A)` tags.** Build two phrases with identical pitches/rhythms, one without; assert the prompt contains `(repeat A)` exactly twice and no `(repeat B)`.
2. **Singleton phrases get no tag.** A single distinct phrase produces no `(repeat ...)` text in its line header.
3. **Two distinct clusters get A and B.** Three pairs (A, B, C) with three distinct melodic shapes get tags A, B, C; if one shape only appears once, it gets no tag.
4. **The new rule appears in the RULES block.** Assert the prompt contains `8. Lines sharing a \`repeat`.
5. **Existing principles-block snapshot test still passes** (no edits to that block).
6. **Existing `compoundProsody` test still passes**.

In `src/structure.test.ts`: existing `detectClusters` tests continue to pass (no changes to `structure.ts`).

## Edge cases

- **Empty phrases**: `detectClusters([])` returns `[]`, so `clusterTags` returns `[]`. No tags. Safe.
- **All-singleton clusters**: every phrase is unique → no `(repeat ...)` annotations anywhere. The new rule still appears in the prompt — harmless because no line carries the tag.
- **Many clusters**: cluster letters can run past Z. With 26 distinct repeating clusters we'd run into `[`. In practice songs have <5 distinct repeating clusters, but a guard: if more than 26 clusters of size ≥ 2 exist, additional clusters get no tag (degrade gracefully). Test covers this only if it becomes an issue; otherwise documented as a known limit.
- **User-overridden section labels**: cluster IDs are derived from the *current phrases*, not section labels. So if the user manually re-labels two clusters as "Chorus 1 / Verse 2", the cluster tag still shows them as `(repeat A)` — the prompt then has both signals (label + cluster) and the model sees the conflict, which it can resolve via the rule's "unless the section labels suggest contrasting verses" caveat.

## Risks / mitigations

- **Risk:** the model interprets the tag too rigidly and copies even when the section label demands variation. *Mitigation:* the rule's wording explicitly mentions the variation case ("unless the section labels suggest contrasting verses").
- **Risk:** clusters detected too eagerly (similarity threshold of 0.85 in `structure.ts` is permissive). Two phrases that "feel" similar but are intentionally distinct might get tagged. *Mitigation:* spec accepts the existing threshold for now; if testing reveals false positives, raise the threshold in a follow-up. The prompt rule still allows variation, so even a false positive doesn't force bad output.
- **Risk:** the new tag adds tokens to every prompt. *Mitigation:* one extra `(repeat X)` per relevant line, ~3 tokens × N lines. Negligible.

## Success criteria

- All existing tests pass.
- New tests in §"Tests" pass.
- Manual smoke on a 5-phrase melody (same as the recent test) shows `(repeat A)` on the two clustered lines and the model produces an intentional repeat or a section-aware variation, *not* a confused mid-song duplicate.
- No changes to validator behavior (no new failure types, no test churn outside `src/prompt.ts` and `src/prompt.test.ts`).
