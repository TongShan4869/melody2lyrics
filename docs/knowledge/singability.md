# Singability — Musical Prosody Knowledge Base

Curated reference for the prosody alignment used by the lyric generator. Source: Liang et al., *XAI-Lyricist: Improving the Singability of AI-Generated Lyrics with Prosody Explanations*, IJCAI-24 (`docs/XAI_LYRICS.pdf`).

## Why singability matters

The XAI-Lyricist human study (n = 14, all musically trained) found that explicit prosody alignment lifts one-trial singing success from 27.1 % (vanilla LM) to 85.7 %. Lyrics that violate prosody force singers to pause, retry, or invent ad-hoc rhythm fixes.

## The two alignment principles

### 1. Strength alignment

| Note side | Syllable side |
|---|---|
| Strong-beat notes (beats 1 and 3 in 4/4) | Stressed syllables (IPA `ˈ`) |
| Weak-beat notes (beats 2 and 4 in 4/4) | Unstressed syllables |

### 2. Length alignment

| Note side | Syllable side |
|---|---|
| Long notes (duration > phrase mean) | Long syllables — IPA `ː` (long vowels) or any diphthong |
| Short notes | Short syllables — pure short vowels, no diphthong |

**Diphthongs** (each is one syllable with two vowel sounds, comfortably sustainable):
- `/eɪ/` — *day, way, stay*
- `/aɪ/` — *sky, fly, mine*
- `/aʊ/` — *down, now, around*
- `/oʊ/` — *slow, road, alone*
- `/ɔɪ/` — *boy, joy*

**Long monophthongs** (IPA `ː`):
- `/iː/` — *see, free, dream*
- `/uː/` — *you, do, blue*
- `/ɑː/` — *far, heart, are*
- `/ɔː/` — *saw, fall, all*

**Short / closed vowels** (don't sustain well on long notes):
- `/ɪ/` (it, this, wish), `/ʊ/` (good, could), `/ʌ/` (love, above), `/ɛ/` (red, said), `/æ/` (sad, back)

## Compound template

XAI-Lyricist combines both axes into one token per slot:

```
<strong,long>  <strong,short>  <weak,long>  <weak,short>
```

A four-syllable line over a melody might be:

```
<strong,long>-<weak,short>-<strong,short>-<weak,long>
```

This is what `buildPrompt` produces under `prosody = …` for each line. The LM sees one compact, unambiguous template per line instead of two separate strings.

## Worked example: "Hey Jude"

(From Figure 1 of the paper.)

| Word | Stress | Length | Note | Reason |
|---|---|---|---|---|
| hey | weak | short | weak-beat short | pickup |
| **JUDE** /dʒuːd/ | strong | long | strong-beat long | beat 1, `/uː/` |
| don't | weak | short | weak-beat short | beat 2 |
| make | weak | short | weak-beat short | beat 2.5 |
| it | weak | short | weak-beat short | beat 3 weak slot |
| **SAD** /sæd/ | strong | short | strong-beat short | beat 4, `/æ/` |

Note that "sad" is *strong* (stressed) but *short* (no long vowel, no diphthong). This is fine — strength and length are independent axes.

## How the codebase uses this knowledge

- `src/prosody.ts` writes `length: 'L' | 'S'` onto each `AnalyzedNote`. The threshold is per-phrase mean duration.
- `src/prompt.ts` `compoundProsody()` emits `<strong,long>` etc. per slot for every line.
- `src/prompt.ts` `buildPrompt()` includes a 4-line `PROSODY PRINCIPLES` block summarizing the rules above.
- `src/validators.ts` `lengthAlignmentValidator` enforces the line-final case: if the last note is long, the last word must end in a long-singable vowel (open or diphthong via `vowels.ts`).

## Citation

```bibtex
@inproceedings{liang2024xailyricist,
  title     = {XAI-Lyricist: Improving the Singability of AI-Generated Lyrics with Prosody Explanations},
  author    = {Liang, Qihao and Ma, Xichu and Doshi-Velez, Finale and Lim, Brian and Wang, Ye},
  booktitle = {Proceedings of the Thirty-Third International Joint Conference on Artificial Intelligence (IJCAI-24)},
  year      = {2024}
}
```
