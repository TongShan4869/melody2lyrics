import { describe, expect, it } from 'vitest';
import { runPipeline } from './agent';
import type { IterationLog, LyricsContext, Phrase, PhraseLockState, PipelineInput } from './types';
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

describe('runPipeline revision loop', () => {
  it('runs a revision iteration when the initial output fails', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];

    const responses = [
      '1. one two three four\n2. four five six',
      '1. one two three\n2. four five six',
    ];
    let call = 0;
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => responses[call++] ?? responses[responses.length - 1],
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.iterations).toHaveLength(2);
    expect(log.iterations[1].kind).toBe('revise');
    expect(log.finalStatus).toBe('clean');
  });

  it('caps at maxIterations and reports capped', async () => {
    const phrases = [phrase(3, 'a')];
    const locks: PhraseLockState[] = [parseLockInput('', 0)];
    const sectionLabels = ['Verse 1'];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => '1. way too many syllables in one line',
      maxIterations: 2,
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.iterations).toHaveLength(2);
    expect(log.finalStatus).toBe('capped');
  });

  it('preserves pinned lines verbatim across iterations', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map([[0, 'pinned line one']]),
      llmCall: async () => '1. wrong line\n2. four five six',
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.iterations[0].output[0]).toBe('pinned line one');
  });
});

describe('runPipeline abort', () => {
  it('returns error status when llmCall throws AbortError', async () => {
    const phrases = [phrase(3, 'a')];
    const locks: PhraseLockState[] = [parseLockInput('', 0)];
    const sectionLabels = ['Verse 1'];
    const controller = new AbortController();
    controller.abort();
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async (_prompt, signal) => {
        if (signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return '';
      },
      signal: controller.signal,
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.finalStatus).toBe('error');
    expect(log.errorMessage).toContain('aborted');
  });
});

describe('runPipeline empty-output guard', () => {
  it('reports error when initial output has zero parseable lines', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => '   ', // whitespace only
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.finalStatus).toBe('error');
    expect(log.errorMessage).toContain('no parseable');
  });

  it('reports error when revision output has zero parseable lines', async () => {
    const phrases = [phrase(3, 'a'), phrase(3, 'b')];
    const locks: PhraseLockState[] = [parseLockInput('', 0), parseLockInput('', 1)];
    const sectionLabels = ['Verse 1', 'Verse 1'];
    const responses = [
      '1. one two three four\n2. four five six',  // initial: line 1 fails (4 syllables, target 3)
      '',  // revision returns empty
    ];
    let call = 0;
    const input: PipelineInput = {
      phrases, locks, sectionLabels, context: ctx,
      pinnedLines: new Map(),
      llmCall: async () => responses[call++] ?? '',
    };
    const { result } = await consume(runPipeline(input));
    const log = result as IterationLog;
    expect(log.finalStatus).toBe('error');
    expect(log.errorMessage).toContain('Revision returned no parseable');
  });
});
