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
  sectionLabels: string;
  strictSyllables: boolean;
};

export type GeneratedLine = {
  text: string;
  locked: boolean;
  invalid: boolean;
  validationMessage?: string;
};
