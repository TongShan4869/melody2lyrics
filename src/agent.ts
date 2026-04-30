import type {
  Iteration,
  IterationLog,
  LineValidation,
  PipelineInput,
} from './types';
import { buildPrompt } from './prompt';
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
  // _max reserved for Task 16 revision loop
  const _max = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  void _max;
  const iterations: Iteration[] = [];

  const initialPrompt = buildPrompt(
    input.phrases,
    input.locks,
    input.context,
    input.sectionLabels,
  );

  let raw: string;
  try {
    raw = await input.llmCall(initialPrompt, input.signal);
  } catch (caught) {
    const log: IterationLog = {
      iterations,
      finalStatus: 'error',
      errorMessage: caught instanceof Error ? caught.message : 'LLM call failed',
    };
    return log;
  }

  const lines = parseLines(raw, input.phrases.length);
  const validations: LineValidation[] = validateLines(
    lines, input.phrases, input.locks, input.sectionLabels, input.context,
  );

  const iteration: Iteration = {
    number: 1,
    kind: 'initial',
    output: lines,
    validations,
    failingIndices: validations.filter((v) => !v.passed).map((v) => v.index),
  };
  iterations.push(iteration);
  yield iteration;

  const finalStatus: IterationLog['finalStatus'] = iteration.failingIndices.length === 0 ? 'clean' : 'capped';
  return { iterations, finalStatus };
}
