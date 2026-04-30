import { describe, expect, it } from 'vitest';
import { runPipeline } from './agent';
import type { LyricsContext, Phrase, PhraseLockState, PipelineInput } from './types';
import { parseLockInput } from './locks';

const ctx: LyricsContext = {
  theme: '', mood: '', genre: '', pov: '', otherNotes: '',
  mustInclude: '', avoid: '', rhymeScheme: 'SECTION', strictSyllables: true,
};

const phrase = (syllables: number, id = 'p'): Phrase => ({
  id, notes: [], syllables,
  stressPattern: '', endingDirection: 'level', startTime: 0, endTime: 0,
});

async function consume(gen: AsyncGenerator<unknown, unknown>) {
  const yielded: unknown[] = [];
  let result: unknown;
  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    yielded.push(next.value);
  }
  return { yielded, result };
}

describe('runPipeline initial generation', () => {
  it('yields one iteration when first generation passes', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => '1. one two three\n2. four five six',
    };
    const { yielded, result } = await consume(runPipeline(input));
    expect(yielded).toHaveLength(1);
    const log = result as { finalStatus: string; iterations: unknown[] };
    expect(log.finalStatus).toBe('clean');
    expect(log.iterations).toHaveLength(1);
  });
});
