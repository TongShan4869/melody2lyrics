export type Note = {
  id: string;
  midi: number;
  pitch: string;
  time: number;
  duration: number;
  velocity: number;
  ticks?: number;
  durationTicks?: number;
  ppq?: number;
  timeSignature?: [number, number];
};

export type MidiFileInfo = {
  tempos: number[];
  timeSignature: [number, number];
  ppq: number;
  trackName: string;
};

export type ParsedMidi = {
  notes: Note[];
  info: MidiFileInfo;
};

export type AnalyzedNote = Note & {
  stressScore: number;
  stress: 'S' | 'w';
  length: 'L' | 'S';
};

export type Phrase = {
  id: string;
  notes: AnalyzedNote[];
  syllables: number;
  stressPattern: string;
  endingDirection: 'rising' | 'falling' | 'level';
  startTime: number;
  endTime: number;
};

export type LockPolicy = 'strict' | 'trim' | 'pad' | 'auto';

export type LockToken =
  | { kind: 'free'; syllables: 1 }
  | { kind: 'locked'; word: string; syllables: number };

export type PhraseLockState = {
  phraseIndex: number;
  rawInput: string;
  tokens: LockToken[];
  totalSyllables: number;
  policy: LockPolicy;
  lockedAfterGeneration: boolean;
};

export type LyricsContext = {
  theme: string;
  mood: string;
  genre: string;
  pov: string;
  otherNotes: string;
  mustInclude: string;
  avoid: string;
  rhymeScheme: string;
  strictSyllables: boolean;
  direction?: string;
};

export type GeneratedLine = {
  text: string;
  locked: boolean;
  validation: LineValidation | null;
};

export type ValidationFailureType =
  | 'syllables'
  | 'locked-words'
  | 'end-collision'
  | 'filler'
  | 'held-vowel'
  | 'avoid';

export type ValidationFailure = {
  type: ValidationFailureType;
  message: string;
};

export type LineValidation = {
  index: number;
  text: string;
  passed: boolean;
  failures: ValidationFailure[];
};

export type Iteration = {
  number: number;
  kind: 'initial' | 'revise';
  output: string[];
  validations: LineValidation[];
  failingIndices: number[];
};

export type IterationLog = {
  iterations: Iteration[];
  finalStatus: 'clean' | 'capped' | 'error' | 'idle';
  errorMessage?: string;
};

export type LLMCall = (prompt: string, signal?: AbortSignal) => Promise<string>;

export type PipelineInput = {
  phrases: Phrase[];
  locks: PhraseLockState[];
  sectionLabels: string[];
  context: LyricsContext;
  pinnedLines: Map<number, string>;
  llmCall: LLMCall;
  maxIterations?: number;
  signal?: AbortSignal;
};

export type PhraseOrigin = 'auto' | 'manual';
