import type {
  Iteration,
  IterationLog,
  PipelineInput,
} from './types';
import { buildPrompt, buildRevisionPrompt } from './prompt';
import { validateLines } from './validators';

const DEFAULT_MAX_ITERATIONS = 3;

function parseLines(raw: string, expected: number): string[] {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[\).:-]?\s*/, '').trim())
    .filter(Boolean)
    .slice(0, expected);
}

export async function* runPipeline(
  input: PipelineInput,
): AsyncGenerator<Iteration, IterationLog> {
  const max = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const iterations: Iteration[] = [];
  const previousAttempts = new Map<number, string[]>();

  const applyPinned = (lines: string[]): string[] =>
    lines.map((line, index) => input.pinnedLines.get(index) ?? line);

  // Iteration 1: initial generation.
  const initialPrompt = buildPrompt(
    input.phrases, input.locks, input.context, input.sectionLabels,
  );

  let raw: string;
  try {
    raw = await input.llmCall(initialPrompt, input.signal);
  } catch (caught) {
    return errorLog(iterations, caught);
  }
  console.debug('[runPipeline] LLM output:', raw);

  let lines = applyPinned(parseLines(raw, input.phrases.length));
  if (lines.length === 0 && input.phrases.length > 0) {
    const excerpt = raw.trim().slice(0, 500) || '(empty response)';
    return {
      iterations,
      finalStatus: 'error',
      errorMessage: `Model returned no parseable lyric lines. Raw response: ${excerpt}`,
    };
  }
  let validations = validateLines(lines, input.phrases, input.locks, input.sectionLabels, input.context);
  const initial: Iteration = {
    number: 1,
    kind: 'initial',
    output: lines,
    validations,
    failingIndices: validations.filter((v) => !v.passed).map((v) => v.index),
  };
  iterations.push(initial);
  yield initial;

  if (initial.failingIndices.length === 0) {
    return { iterations, finalStatus: 'clean' };
  }

  // Revision iterations.
  while (iterations.length < max) {
    const last = iterations[iterations.length - 1];
    if (last.failingIndices.length === 0) break;

    last.failingIndices.forEach((index) => {
      const text = last.output[index];
      const list = previousAttempts.get(index) ?? [];
      list.push(text);
      previousAttempts.set(index, list);
    });

    const revisionPrompt = buildRevisionPrompt({
      phrases: input.phrases,
      locks: input.locks,
      sectionLabels: input.sectionLabels,
      context: input.context,
      currentLines: last.output,
      validations: last.validations,
      previousAttempts,
    });

    let nextRaw: string;
    try {
      nextRaw = await input.llmCall(revisionPrompt, input.signal);
    } catch (caught) {
      return errorLog(iterations, caught);
    }
    console.debug('[runPipeline] LLM output:', nextRaw);

    const nextLines = applyPinned(parseLines(nextRaw, input.phrases.length));
    if (nextLines.length === 0 && input.phrases.length > 0) {
      const excerpt = nextRaw.trim().slice(0, 500) || '(empty response)';
      return {
        iterations,
        finalStatus: 'error',
        errorMessage: `Revision returned no parseable lines. Raw response: ${excerpt}`,
      };
    }
    const merged = nextLines.map((line, index) =>
      last.failingIndices.includes(index) ? line : last.output[index],
    );
    const nextValidations = validateLines(merged, input.phrases, input.locks, input.sectionLabels, input.context);
    const next: Iteration = {
      number: iterations.length + 1,
      kind: 'revise',
      output: merged,
      validations: nextValidations,
      failingIndices: nextValidations.filter((v) => !v.passed).map((v) => v.index),
    };
    iterations.push(next);
    yield next;

    if (next.failingIndices.length === 0) {
      return { iterations, finalStatus: 'clean' };
    }
  }

  const finalIteration = iterations[iterations.length - 1];
  return {
    iterations,
    finalStatus: finalIteration.failingIndices.length === 0 ? 'clean' : 'capped',
  };
}

function errorLog(iterations: Iteration[], caught: unknown): IterationLog {
  return {
    iterations,
    finalStatus: 'error',
    errorMessage: caught instanceof Error ? caught.message : 'LLM call failed',
  };
}
