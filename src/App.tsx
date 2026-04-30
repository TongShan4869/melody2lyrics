import { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Download, FileMusic, Lock, Pause, Play, Unlock, Wand2, XCircle } from 'lucide-react';
import { parseMidiFile } from './midi';
import { analyzeNotes, mergePhrases, splitPhrase } from './prosody';
import { buildPrompt } from './prompt';
import { parseLockInput } from './locks';
import { generateWithAnthropic, generateWithDeepSeek, generateWithOpenAI } from './llm';
import type { GeneratedLine, IterationLog, LineValidation, LockPolicy, LyricsContext, MidiFileInfo, Note, Phrase, PhraseLockState } from './types';
import { runPipeline } from './agent';
import { PhraseRow } from './components/PhraseRow';
import { melodyDuration, schedulePreview, type PlaybackHandle } from './playback';
import { detectSections } from './structure';

const initialContext: LyricsContext = {
  theme: '',
  mood: '',
  genre: '',
  pov: '',
  otherNotes: '',
  mustInclude: '',
  avoid: '',
  rhymeScheme: 'SECTION',
  strictSyllables: true,
};

const sectionOptions = ['Intro', 'Verse', 'Rap verse', 'Pre-chorus', 'Chorus', 'Post-chorus', 'Rap break', 'Bridge', 'Outro', 'Ad-lib'];
const sectionRepeatOptions = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const CUSTOM_SECTION = '__custom_section__';
const CUSTOM_RHYME = '__custom_rhyme__';

type LlmProvider = 'openai' | 'anthropic' | 'deepseek';
const CUSTOM_MODEL = '__custom__';

const modelOptions: Record<LlmProvider, Array<{ value: string; label: string }>> = {
  openai: [
    { value: 'gpt-5.5', label: 'GPT-5.5' },
    { value: 'gpt-5.4', label: 'GPT-5.4' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
    { value: CUSTOM_MODEL, label: 'Custom model ID' },
  ],
  anthropic: [
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: CUSTOM_MODEL, label: 'Custom model ID' },
  ],
  deepseek: [
    { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat legacy' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner legacy' },
    { value: CUSTOM_MODEL, label: 'Custom model ID' },
  ],
};

function providerLabel(provider: LlmProvider): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'deepseek') return 'DeepSeek';
  return 'OpenAI';
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function defaultSectionLabels(count: number): string[] {
  return Array.from({ length: count }, () => 'Verse 1');
}

function parseSectionLabel(label: string): { type: string; repeat: string } {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.*?)(?:\s+(\d+))?$/);
  return {
    type: match?.[1]?.trim() || '',
    repeat: match?.[2] ?? '',
  };
}

function formatSectionLabel(type: string, repeat: string): string {
  const cleanType = type.trim();
  const cleanRepeat = repeat.trim();
  if (!cleanType) return cleanRepeat ? `Section ${cleanRepeat}` : '';
  return cleanRepeat ? `${cleanType} ${cleanRepeat}` : cleanType;
}

function nextSectionLabel(label: string): string {
  const parsed = parseSectionLabel(label);
  const type = parsed.type || 'Section';
  const repeat = Number.parseInt(parsed.repeat || '1', 10);
  return formatSectionLabel(type, String(Number.isFinite(repeat) ? repeat + 1 : 2));
}

function rhymeModeValue(rhymeScheme: string): string {
  const normalized = rhymeScheme.trim().toUpperCase();
  if (normalized === 'SECTION' || normalized === 'FREE') return normalized;
  return CUSTOM_RHYME;
}

function syncSectionLabels(existing: string[], count: number): string[] {
  const defaults = defaultSectionLabels(count);
  return Array.from({ length: count }, (_, index) => existing[index] ?? defaults[index] ?? '');
}

function sectionEndIndex(labels: string[], startIndex: number, totalCount: number): number {
  const label = labels[startIndex] ?? '';
  let endIndex = startIndex + 1;
  while (endIndex < totalCount && (labels[endIndex] ?? '') === label) {
    endIndex += 1;
  }
  return endIndex;
}

function SectionMarker({
  label,
  lineStart,
  lineEnd,
  canRemove,
  onChange,
  onRemove,
}: {
  label: string;
  lineStart: number;
  lineEnd: number;
  canRemove: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const parsedLabel = parseSectionLabel(label);
  const isPresetSection = sectionOptions.includes(parsedLabel.type);
  const selectValue = isPresetSection ? parsedLabel.type : CUSTOM_SECTION;
  const lineRange = lineStart === lineEnd ? `Line ${lineStart}` : `Lines ${lineStart}-${lineEnd}`;

  return (
    <div className="section-marker">
      <div>
        <span className="eyebrow">Section marker</span>
        <strong>{lineRange}</strong>
      </div>
      <label className="section-label">
        <span>Type</span>
        <div className="section-control">
          <select
            value={selectValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              onChange(formatSectionLabel(nextValue === CUSTOM_SECTION ? '' : nextValue, parsedLabel.repeat));
            }}
          >
            {sectionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
            <option value={CUSTOM_SECTION}>Custom...</option>
          </select>
          {selectValue === CUSTOM_SECTION && (
            <input
              value={parsedLabel.type}
              placeholder="Custom section"
              onChange={(event) => onChange(formatSectionLabel(event.target.value, parsedLabel.repeat))}
            />
          )}
        </div>
      </label>
      <label className="section-label repeat-label">
        <span>Repeat</span>
        <select value={parsedLabel.repeat} onChange={(event) => onChange(formatSectionLabel(parsedLabel.type, event.target.value))}>
          {sectionRepeatOptions.map((option) => (
            <option key={option || 'none'} value={option}>{option || '-'}</option>
          ))}
        </select>
      </label>
      <button type="button" className="ghost small" disabled={!canRemove} onClick={onRemove}>Remove marker</button>
    </div>
  );
}

function InfoLabel({ label, info }: { label: string; info: string }) {
  return (
    <span className="field-label">
      <span>{label}</span>
      <span className="info-bubble" tabIndex={0} aria-label={`${label}: ${info}`}>
        <span aria-hidden="true">i</span>
        <span className="tooltip" role="tooltip">{info}</span>
      </span>
    </span>
  );
}

function IterationLogPanel({ log }: { log: IterationLog }) {
  const [expanded, setExpanded] = useState(true);
  if (log.iterations.length === 0 && log.finalStatus === 'idle') return null;

  return (
    <div className="iteration-log">
      <button type="button" className="iteration-log-header" onClick={() => setExpanded(!expanded)}>
        <span>Iteration log</span>
        <span className="mono">{log.iterations.length} iter · {log.finalStatus}</span>
      </button>
      {expanded && (
        <div className="iteration-log-body">
          {log.iterations.map((iteration) => {
            const passed = iteration.validations.filter((v) => v.passed).length;
            const total = iteration.validations.length;
            return (
              <div key={iteration.number} className="iteration-entry">
                <strong>Iter {iteration.number} · {iteration.kind} · {passed}/{total} passed</strong>
                {iteration.failingIndices.map((index) => {
                  const validation = iteration.validations[index];
                  return (
                    <div key={index} className="iteration-failure">
                      Line {index + 1} — {validation.failures.map((f) => f.message).join('; ')}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {log.finalStatus === 'capped' && <p className="iteration-final">Stopped: hit iteration cap with unresolved lines.</p>}
          {log.finalStatus === 'clean' && <p className="iteration-final">Stopped: clean.</p>}
          {log.finalStatus === 'error' && <p className="iteration-final">Stopped: {log.errorMessage}</p>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [fileName, setFileName] = useState('');
  const [midiInfo, setMidiInfo] = useState<MidiFileInfo | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [locks, setLocks] = useState<PhraseLockState[]>([]);
  const [sectionLabels, setSectionLabels] = useState<string[]>([]);
  const [context, setContext] = useState<LyricsContext>(initialContext);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [openAIModel, setOpenAIModel] = useState('gpt-5.5');
  const [anthropicModel, setAnthropicModel] = useState('claude-opus-4-7');
  const [deepSeekModel, setDeepSeekModel] = useState('deepseek-v4-flash');
  const [customModel, setCustomModel] = useState('');
  const [promptVisible, setPromptVisible] = useState(true);
  const [output, setOutput] = useState<GeneratedLine[]>([]);
  const [iterationLog, setIterationLog] = useState<IterationLog>({ iterations: [], finalStatus: 'idle' });
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [previewStartTime, setPreviewStartTime] = useState(0);
  const [previewEndTime, setPreviewEndTime] = useState(0);
  const [playingPhraseId, setPlayingPhraseId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const playbackStartTimeRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  const effectiveLocks = useMemo(() => locks.map((lock, index) => {
    const lockedOutput = output[index];
    if (!lockedOutput?.locked) return lock;
    return {
      ...parseLockInput(lockedOutput.text, index, 'strict'),
      lockedAfterGeneration: true,
    };
  }), [locks, output]);
  const prompt = useMemo(() => buildPrompt(phrases, effectiveLocks, context, sectionLabels), [phrases, effectiveLocks, context, sectionLabels]);
  const strictMismatch = effectiveLocks.some((lock, index) => (
    !lock.lockedAfterGeneration
    && lock.policy === 'strict'
    && lock.rawInput.trim()
    && lock.totalSyllables !== phrases[index]?.syllables
  ));
  const canGenerate = phrases.length > 0 && !strictMismatch && !isGenerating;
  const duration = useMemo(() => melodyDuration(notes), [notes]);
  const previewDuration = Math.max(0, previewEndTime - previewStartTime);
  const activeNoteIds = useMemo(() => {
    if (!isPlaying) return new Set<string>();
    return new Set(notes
      .filter((note) => playheadTime >= note.time && playheadTime <= note.time + note.duration)
      .map((note) => note.id));
  }, [isPlaying, notes, playheadTime]);

  useEffect(() => () => stopPreview(), []);
  useEffect(() => {
    if (!copyStatus) return;
    const timeout = window.setTimeout(() => setCopyStatus(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  async function handleFile(file: File) {
    setError('');
    if (file.size > 10 * 1024 * 1024) {
      setError('File is over the 10 MB cap.');
      return;
    }

    if (!/\.(mid|midi)$/i.test(file.name)) {
      setError('MIDI is implemented in this first build. Audio upload is reserved for the Basic Pitch pass.');
      return;
    }

    try {
      const parsed = await parseMidiFile(file);
      const analyzed = analyzeNotes(parsed.notes);
      setFileName(file.name);
      setMidiInfo(parsed.info);
      setNotes(parsed.notes);
      setPhrases(analyzed);
      setLocks(analyzed.map((_, index) => parseLockInput('', index)));
      setSectionLabels(detectSections(analyzed));
      setOutput([]);
      setPlayheadTime(0);
      setPreviewStartTime(0);
      setPreviewEndTime(melodyDuration(parsed.notes));
      setPlayingPhraseId(null);
      stopPreview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not parse the file.');
    }
  }

  function updatePhrases(nextPhrases: Phrase[], nextSectionLabels?: string[]) {
    setPhrases(nextPhrases);
    setLocks((existing) => nextPhrases.map((_, index) => existing[index] ?? parseLockInput('', index)));
    setSectionLabels((existing) => syncSectionLabels(nextSectionLabels ?? existing, nextPhrases.length));
  }

  function handleSectionMarkerChange(startIndex: number, value: string) {
    setSectionLabels((existing) => {
      const synced = syncSectionLabels(existing, phrases.length);
      const endIndex = sectionEndIndex(synced, startIndex, phrases.length);
      return synced.map((label, index) => (index >= startIndex && index < endIndex ? value : label));
    });
  }

  function handleAddSectionMarker(index: number) {
    setSectionLabels((existing) => {
      const synced = syncSectionLabels(existing, phrases.length);
      if (index <= 0 || synced[index] !== synced[index - 1]) return synced;
      const endIndex = sectionEndIndex(synced, index, phrases.length);
      const label = nextSectionLabel(synced[index - 1] ?? synced[index] ?? 'Section 1');
      return synced.map((existingLabel, labelIndex) => (labelIndex >= index && labelIndex < endIndex ? label : existingLabel));
    });
  }

  function handleRemoveSectionMarker(index: number) {
    setSectionLabels((existing) => {
      const synced = syncSectionLabels(existing, phrases.length);
      if (index <= 0) return synced;
      const previousLabel = synced[index - 1] ?? '';
      const endIndex = sectionEndIndex(synced, index, phrases.length);
      return synced.map((label, labelIndex) => (labelIndex >= index && labelIndex < endIndex ? previousLabel : label));
    });
  }

  function handleLockInputChange(index: number, value: string) {
    setLocks((existing) => existing.map((lock, lockIndex) => lockIndex === index ? parseLockInput(value, index, lock.policy) : lock));
  }

  function handlePolicyChange(index: number, policy: LockPolicy) {
    setLocks((existing) => existing.map((lock, lockIndex) => lockIndex === index ? { ...lock, policy } : lock));
  }

  function handleClearLock(index: number) {
    setLocks((existing) => existing.map((lock, lockIndex) => lockIndex === index ? parseLockInput('', index, lock.policy) : lock));
  }

  function handleSplit(phraseIndex: number, noteIndex: number) {
    const nextSectionLabels = [
      ...sectionLabels.slice(0, phraseIndex + 1),
      sectionLabels[phraseIndex] ?? '',
      ...sectionLabels.slice(phraseIndex + 1),
    ];
    updatePhrases(splitPhrase(phrases, phraseIndex, noteIndex), nextSectionLabels);
  }

  function handleMerge(phraseIndex: number) {
    updatePhrases(mergePhrases(phrases, phraseIndex), sectionLabels.filter((_, index) => index !== phraseIndex + 1));
  }

  async function togglePreview() {
    if (isPlaying) {
      stopPreview();
      return;
    }

    await playPreviewSegment(notes, 0, duration, null);
  }

  async function playPhrasePreview(phrase: Phrase) {
    if (isPlaying && playingPhraseId === phrase.id) {
      stopPreview();
      return;
    }

    await playPreviewSegment(phrase.notes, phrase.startTime, phrase.endTime, phrase.id);
  }

  async function playPreviewSegment(segmentNotes: Note[], startTime: number, endTime: number, phraseId: string | null) {
    stopPreview(false);
    if (!segmentNotes.length) return;

    const AudioContextClass = window.AudioContext;
    const audioContext = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = audioContext;
    await audioContext.resume();

    const segmentDuration = Math.max(0, endTime - startTime);
    setPlayheadTime(startTime);
    setPreviewStartTime(startTime);
    setPreviewEndTime(endTime);
    setPlayingPhraseId(phraseId);
    playbackRef.current = schedulePreview(segmentNotes, audioContext, startTime);
    playbackStartTimeRef.current = performance.now();
    setIsPlaying(true);

    const tick = () => {
      const elapsed = (performance.now() - playbackStartTimeRef.current) / 1000;
      if (elapsed >= segmentDuration) {
        setPlayheadTime(endTime);
        stopPreview(false);
        return;
      }
      setPlayheadTime(startTime + elapsed);
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
  }

  function stopPreview(resetPlayhead = true) {
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
    setPlayingPhraseId(null);
    if (resetPlayhead) setPlayheadTime(0);
  }

  function lockAll() {
    setOutput((existing) => existing.map((line) => ({ ...line, locked: true })));
  }

  function unlockAll() {
    setOutput((existing) => existing.map((line) => ({ ...line, locked: false })));
  }

  function clearLocks() {
    setLocks(phrases.map((_, index) => parseLockInput('', index)));
    setOutput((existing) => existing.map((line) => ({ ...line, locked: false })));
  }

  async function copyToClipboard(text: string, successMessage: string) {
    if (!text.trim()) {
      setCopyStatus('Nothing to copy yet.');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      setCopyStatus(successMessage);
    } catch {
      try {
        fallbackCopy(text);
        setCopyStatus(successMessage);
      } catch {
        setCopyStatus('Copy failed. Select the text manually.');
      }
    }
  }

  function fallbackCopy(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', 'true');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const didCopy = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (!didCopy) throw new Error('Fallback copy failed');
  }

  function copyPrompt() {
    void copyToClipboard(prompt, 'Prompt copied.');
  }

  function copyLyrics() {
    void copyToClipboard(output.map((line) => line.text).join('\n'), 'Lyrics copied.');
  }

  function modelForProvider(provider: LlmProvider): string {
    if (provider === 'anthropic') return anthropicModel;
    if (provider === 'deepseek') return deepSeekModel;
    return openAIModel;
  }

  function selectedModelForProvider(provider: LlmProvider): string {
    const selectedModel = modelForProvider(provider);
    if (selectedModel === CUSTOM_MODEL) return customModel.trim();
    return selectedModel;
  }

  function generateForProvider(provider: LlmProvider, promptText: string, key: string, signal?: AbortSignal): Promise<string> {
    if (provider === 'anthropic') {
      return generateWithAnthropic(promptText, key, selectedModelForProvider(provider) || 'claude-opus-4-7', signal);
    }

    if (provider === 'deepseek') {
      return generateWithDeepSeek(promptText, key, selectedModelForProvider(provider) || 'deepseek-v4-flash', signal);
    }

    return generateWithOpenAI(promptText, key, selectedModelForProvider(provider) || 'gpt-5.5', signal);
  }

  function exportText() {
    const metadata = [
      '# Melody-to-Lyrics Export',
      `File: ${fileName || 'untitled'}`,
      `Date: ${new Date().toISOString()}`,
      `Tempo: ${midiInfo?.tempos.join(', ') || 'unknown'} BPM`,
      `Meter: ${midiInfo ? `${midiInfo.timeSignature[0]}/${midiInfo.timeSignature[1]}` : 'unknown'}`,
      `PPQ: ${midiInfo?.ppq ?? 'unknown'}`,
      `Prosody: ${phrases.map((phrase, index) => `L${index + 1} ${phrase.syllables} ${phrase.stressPattern}`).join('; ')}`,
      `Locks: ${effectiveLocks.map((lock, index) => `L${index + 1}: ${lock.rawInput || 'open'}`).join('; ')}`,
      '',
    ].join('\n');
    const blob = new Blob([metadata, output.map((line) => line.text).join('\n') || prompt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace(/\.[^.]+$/, '') || 'melody'}-lyrics.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function generateLyrics() {
    if (!apiKey.trim()) {
      setError(`Add a ${providerLabel(llmProvider)} API key to generate in-tool, or use Copy prompt.`);
      return;
    }
    if (modelForProvider(llmProvider) === CUSTOM_MODEL && !customModel.trim()) {
      setError('Enter a custom model ID, or choose a curated model from the dropdown.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setIterationLog({ iterations: [], finalStatus: 'idle' });
    abortRef.current = new AbortController();

    const pinnedLines = new Map<number, string>();
    output.forEach((line, index) => {
      if (line.locked) pinnedLines.set(index, line.text);
    });

    const llmCall = (promptText: string, signal?: AbortSignal) =>
      generateForProvider(llmProvider, promptText, apiKey.trim(), signal);

    try {
      const generator = runPipeline({
        phrases,
        locks: effectiveLocks,
        sectionLabels,
        context,
        pinnedLines,
        llmCall,
        signal: abortRef.current.signal,
      });

      let log: IterationLog | undefined;
      while (true) {
        const next = await generator.next();
        if (next.done) {
          log = next.value;
          break;
        }
        setIterationLog((existing) => ({
          ...existing,
          iterations: [...existing.iterations, next.value],
        }));
      }

      if (log) {
        setIterationLog(log);
        const final = log.iterations[log.iterations.length - 1];
        if (final) {
          setOutput(final.output.map((text, index) => ({
            text,
            locked: pinnedLines.has(index),
            validation: final.validations[index] ?? null,
          })));
        }
        if (log.finalStatus === 'error') setError(log.errorMessage ?? 'Generation failed.');
      }
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') {
        setError(caught instanceof Error ? caught.message : 'Generation failed.');
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }

  function updateOutputLine(index: number, text: string) {
    setOutput((existing) => existing.map((line, lineIndex) => lineIndex === index ? { ...line, text, locked: true } : line));
  }

  function toggleOutputLock(index: number) {
    setOutput((existing) => existing.map((line, lineIndex) => lineIndex === index ? { ...line, locked: !line.locked } : line));
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <p className="eyebrow">Prosody-aware lyric studio</p>
          <h1>Melody to Lyrics</h1>
        </div>
        <div className="status-pill">{phrases.length ? `${phrases.length} phrases from ${notes.length} notes` : 'No melody loaded'}</div>
      </section>

      {midiInfo && (
        <section className="midi-info" aria-label="MIDI information">
          <span>{midiInfo.trackName}</span>
          <span>{midiInfo.tempos.join(', ')} BPM</span>
          <span>{midiInfo.timeSignature[0]}/{midiInfo.timeSignature[1]}</span>
          <span>{midiInfo.ppq} PPQ</span>
        </section>
      )}

      <section
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <FileMusic size={28} />
        <div>
          <strong>{fileName || 'Drop a MIDI melody'}</strong>
          <span>or choose a .mid/.midi file under 10 MB</span>
        </div>
        <label className="button">
          Browse
          <input type="file" accept=".mid,.midi,audio/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }} />
        </label>
      </section>

      {notes.length > 0 && (
        <section className="preview-panel" aria-label="MIDI preview">
          <button type="button" onClick={togglePreview}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'Stop preview' : 'Play preview'}
          </button>
          <div className="preview-meter">
            <div className="preview-track">
              <div className="preview-fill" style={{ width: `${previewDuration ? ((playheadTime - previewStartTime) / previewDuration) * 100 : 0}%` }} />
            </div>
            <span className="mono">{formatTime(Math.max(0, playheadTime - previewStartTime))} / {formatTime(previewDuration || duration)}</span>
          </div>
        </section>
      )}

      {error && <div className="error"><XCircle size={16} /> {error}</div>}

      <div className="workspace">
        <section className="panel direction-panel">
          <div className="panel-heading">
            <h2>Prosody</h2>
            <div className="button-row">
              <button type="button" className="ghost small" onClick={clearLocks}>Clear locks</button>
            </div>
          </div>
          {phrases.length === 0 ? (
            <p className="empty">Upload a MIDI file to see phrase boundaries, syllable counts, stress, and line-ending direction.</p>
          ) : (
            <div className="phrase-list">
              {phrases.map((phrase, index) => {
                const sectionLabel = sectionLabels[index] ?? '';
                const isSectionStart = index === 0 || sectionLabel !== (sectionLabels[index - 1] ?? '');
                const sectionEnd = isSectionStart ? sectionEndIndex(sectionLabels, index, phrases.length) : index + 1;

                return (
                  <div key={phrase.id} className="phrase-stack">
                    {isSectionStart && (
                      <SectionMarker
                        label={sectionLabel}
                        lineStart={index + 1}
                        lineEnd={sectionEnd}
                        canRemove={index > 0}
                        onChange={(value) => handleSectionMarkerChange(index, value)}
                        onRemove={() => handleRemoveSectionMarker(index)}
                      />
                    )}
                    <PhraseRow
                      phrase={phrase}
                      index={index}
                      lock={locks[index]}
                      onLockInputChange={handleLockInputChange}
                      onPolicyChange={handlePolicyChange}
                      onClear={handleClearLock}
                      onSplit={handleSplit}
                      onMerge={handleMerge}
                      onAddSectionMarker={handleAddSectionMarker}
                      canMerge={index < phrases.length - 1}
                      canAddSectionMarker={index > 0 && !isSectionStart}
                      activeNoteIds={activeNoteIds}
                      isPlaying={playingPhraseId === phrase.id}
                      onPlayPhrase={playPhrasePreview}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Direction</h2>
          </div>
          <div className="form-grid">
            <label><InfoLabel label="Theme" info="The central idea or situation for the lyrics, such as leaving home, late-night longing, or winning after a loss." /><input value={context.theme} onChange={(event) => setContext({ ...context, theme: event.target.value })} /></label>
            <label><InfoLabel label="Mood" info="The emotional color of the lyrics, such as tender, bitter, playful, haunted, euphoric, or restrained." /><input value={context.mood} onChange={(event) => setContext({ ...context, mood: event.target.value })} /></label>
            <label><InfoLabel label="Genre" info="The songwriting style to aim for, such as pop, indie folk, R&B, musical theatre, synthwave, or country." /><input value={context.genre} onChange={(event) => setContext({ ...context, genre: event.target.value })} /></label>
            <label><InfoLabel label="POV" info="The narrator perspective, such as first person I/we, second person you, or third person he/she/they." /><input value={context.pov} onChange={(event) => setContext({ ...context, pov: event.target.value })} /></label>
            <label className="rhyme-control">
              <InfoLabel label="Rhyme mode" info="Section rhyme families means each section gets one shared sound family, such as a chorus around -tion and a rap verse around -ee." />
              <select
                value={rhymeModeValue(context.rhymeScheme)}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setContext({ ...context, rhymeScheme: nextValue === CUSTOM_RHYME ? 'ABAB' : nextValue });
                }}
              >
                <option value="SECTION">Section rhyme families</option>
                <option value={CUSTOM_RHYME}>Line pattern, e.g. ABAB</option>
                <option value="FREE">No fixed rhyme</option>
              </select>
              {rhymeModeValue(context.rhymeScheme) === CUSTOM_RHYME && (
                <input
                  aria-label="Line rhyme pattern"
                  placeholder="ABAB, AABB, AXAX"
                  value={context.rhymeScheme}
                  onChange={(event) => setContext({ ...context, rhymeScheme: event.target.value })}
                />
              )}
              <span className="field-help">Default: one rhyme sound per section. Use a line pattern only when you want labels like A/B per line; X means no rhyme for that slot.</span>
            </label>
            <label><InfoLabel label="Must include" info="Words or phrases the generated lyrics should try to include somewhere, unless locked lines already cover them." /><input value={context.mustInclude} onChange={(event) => setContext({ ...context, mustInclude: event.target.value })} /></label>
            <label><InfoLabel label="Avoid" info="Words, images, topics, or cliches the generator should stay away from." /><input value={context.avoid} onChange={(event) => setContext({ ...context, avoid: event.target.value })} /></label>
          </div>
          <label className="wide"><InfoLabel label="Other notes" info="Any extra creative instruction, reference, story detail, or wording preference that does not fit the structured fields." /><textarea value={context.otherNotes} onChange={(event) => setContext({ ...context, otherNotes: event.target.value })} /></label>
          <label className="toggle"><input type="checkbox" checked={context.strictSyllables} onChange={(event) => setContext({ ...context, strictSyllables: event.target.checked })} /> <InfoLabel label="Strict syllable matching" info="When on, each lyric line must match the melody syllable count exactly. When off, the generator may allow plus or minus one syllable for natural phrasing." /></label>

          <div className="panel-heading prompt-heading">
            <h2>Prompt</h2>
            <div className="button-row">
              <button type="button" className="ghost small" onClick={() => setPromptVisible(!promptVisible)}>{promptVisible ? 'Hide' : 'Show'}</button>
              <button type="button" className="ghost small" disabled={!prompt.trim()} onClick={copyPrompt}><Clipboard size={15} /> Copy prompt</button>
            </div>
          </div>
          {strictMismatch && <div className="warning-box">Strict locked content mismatch exists. Fix the line or switch its policy before generating.</div>}
          {copyStatus && <div className="copy-status" role="status">{copyStatus}</div>}
          {promptVisible && <pre className="prompt-box">{prompt}</pre>}
          <IterationLogPanel log={iterationLog} />

          <div className="generate-row">
            <select className="provider-select" aria-label="LLM provider" value={llmProvider} onChange={(event) => setLlmProvider(event.target.value as LlmProvider)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="deepseek">DeepSeek</option>
            </select>
            <select
              className="model-input"
              aria-label={`${providerLabel(llmProvider)} model`}
              value={modelForProvider(llmProvider)}
              onChange={(event) => {
                if (llmProvider === 'openai') {
                  setOpenAIModel(event.target.value);
                } else if (llmProvider === 'anthropic') {
                  setAnthropicModel(event.target.value);
                } else {
                  setDeepSeekModel(event.target.value);
                }
              }}
            >
              {modelOptions[llmProvider].map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
            {modelForProvider(llmProvider) === CUSTOM_MODEL && (
              <input
                className="custom-model-input"
                aria-label="Custom model ID"
                placeholder="Enter exact model ID"
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
              />
            )}
            <input className="api-key" type="password" placeholder={`${providerLabel(llmProvider)} API key for in-tool generation`} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <button type="button" disabled={!canGenerate} onClick={generateLyrics}><Wand2 size={16} /> {isGenerating ? 'Generating' : 'Generate'}</button>
            {isGenerating && <button type="button" className="ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
          </div>
        </section>
      </div>

      <section className="panel output-panel">
        <div className="panel-heading">
          <h2>Lyrics</h2>
          <div className="button-row">
            <button type="button" className="ghost small" onClick={lockAll}><Lock size={15} /> Lock all</button>
            <button type="button" className="ghost small" onClick={unlockAll}><Unlock size={15} /> Unlock all</button>
            <button type="button" className="ghost small" onClick={copyLyrics}><Clipboard size={15} /> Copy</button>
            <button type="button" className="ghost small" onClick={exportText}><Download size={15} /> Export .txt</button>
          </div>
        </div>
        {output.length === 0 ? (
          <p className="empty">Generated lyrics will appear here. Editing any line locks it for the next pass.</p>
        ) : (
          <div className="output-list">
            {output.map((line, index) => (
              <div key={`${index}-${line.text}`} className={`output-line ${line.validation && !line.validation.passed ? 'invalid' : ''}`}>
                <button type="button" className="icon-button" onClick={() => toggleOutputLock(index)} title={line.locked ? 'Unlock line' : 'Lock line'}>
                  {line.locked ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
                {line.validation && (
                  <span
                    className={`line-badge ${line.validation.passed ? 'pass' : 'warn'}`}
                    title={line.validation.failures.map((f) => f.message).join('; ') || 'passed'}
                  >
                    {line.validation.passed ? '✓' : '!'}
                  </span>
                )}
                <input value={line.text} onChange={(event) => updateOutputLine(index, event.target.value)} />
                <span className="mono">{phrases[index]?.stressPattern}</span>
                {line.validation && !line.validation.passed && (
                  <small>{line.validation.failures.map((f) => f.message).join('; ')}</small>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
