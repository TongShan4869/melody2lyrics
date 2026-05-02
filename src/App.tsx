import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { buildSampleMelody, parseMidiFile, type SampleMelody } from './midi';
import { analyzeNotes, mergePhrases, splitPhrase } from './prosody';
import { buildPrompt } from './prompt';
import { parseLockInput } from './locks';
import { generateWithAnthropic, generateWithDeepSeek, generateWithOpenAI } from './llm';
import { detectSections } from './structure';
import { runPipeline } from './agent';
import { countSyllables, splitLineSyllables } from './syllables';
import { melodyDuration, schedulePreview, type PlaybackHandle } from './playback';
import type {
  GeneratedLine,
  IterationLog,
  LockPolicy,
  LyricsContext,
  MidiFileInfo,
  Note,
  ParsedMidi,
  Phrase,
} from './types';
import { I } from './components/Icons';
import { PianoRoll } from './components/PianoRoll';
import {
  applyTheme,
  TweakRadio,
  TweakSection,
  TweakSelect,
  TweakToggle,
  TweaksPanel,
  useTweaks,
} from './components/TweaksPanel';

const DIRECTION_TEMPLATE = `Theme:
Mood:
Genre:
Point of view: first person

Must include:
Avoid: clichés, forced rhymes

Other notes:
`;

const STYLE_TAGS = [
  'indie folk', 'bedroom pop', 'R&B', 'soul', 'alt rock', 'synth-pop', 'singer-songwriter',
  'female vocal', 'male vocal', 'breathy', 'belted chorus', 'falsetto',
  'melancholy', 'tender', 'wistful', 'defiant', 'dreamy', 'bittersweet',
  'fingerpicked acoustic', 'analog synths', 'lush reverb', 'minimal arrangement',
];

const SECTION_OPTIONS = ['Verse', 'Pre-chorus', 'Chorus', 'Post-chorus', 'Rap verse', 'Bridge', 'Intro', 'Outro'];

type LlmProvider = 'anthropic' | 'openai' | 'deepseek';

const initialContext: LyricsContext = {
  direction: DIRECTION_TEMPLATE,
  theme: '', mood: '', genre: '', pov: '',
  otherNotes: '', mustInclude: '', avoid: '',
  rhymeScheme: 'SECTION', strictSyllables: false,
};

function fmtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function defaultModelFor(provider: LlmProvider): string {
  if (provider === 'anthropic') return 'claude-sonnet-4-6';
  if (provider === 'openai') return 'gpt-5.5';
  return 'deepseek-v4-flash';
}

export default function App() {
  const [tweaks, setTweak] = useTweaks();

  // Data state
  const [fileName, setFileName] = useState('');
  const [midiInfo, setMidiInfo] = useState<MidiFileInfo | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [locks, setLocks] = useState(() => [] as ReturnType<typeof parseLockInput>[]);
  const [sectionLabels, setSectionLabels] = useState<string[]>([]);
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null);
  const [context, setContext] = useState<LyricsContext>(initialContext);
  const [output, setOutput] = useState<GeneratedLine[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [llmProvider, setLlmProvider] = useState<LlmProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModelFor('anthropic'));

  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const playStartRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const playGenRef = useRef(0);

  // Theme + tweaks application
  useEffect(() => { applyTheme(tweaks.theme); }, [tweaks.theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--display', `"${tweaks.fontDisplay}", Georgia, serif`);
  }, [tweaks.fontDisplay]);
  useEffect(() => {
    document.body.style.fontSize = tweaks.density === 'compact' ? '13px' : '14px';
  }, [tweaks.density]);

  // Computed
  const selectedPhraseIdx = phrases.findIndex((p) => p.id === selectedPhraseId);
  const selectedPhrase = selectedPhraseIdx >= 0 ? phrases[selectedPhraseIdx] : null;
  const selectedLock = selectedPhraseIdx >= 0 ? locks[selectedPhraseIdx] : null;

  const effectiveLocks = useMemo(
    () => locks.map((lock, i) => {
      const o = output[i];
      if (!o?.locked) return lock;
      return { ...parseLockInput(o.text, i, 'strict'), lockedAfterGeneration: true };
    }),
    [locks, output],
  );

  const prompt = useMemo(
    () => (phrases.length ? buildPrompt(phrases, effectiveLocks, context, sectionLabels) : ''),
    [phrases, effectiveLocks, context, sectionLabels],
  );

  const strictMismatch = effectiveLocks.some((lock, i) => (
    !lock.lockedAfterGeneration
    && lock.policy === 'strict'
    && lock.rawInput.trim() !== ''
    && lock.totalSyllables !== phrases[i]?.syllables
  ));

  const totalDuration = useMemo(() => melodyDuration(notes), [notes]);

  const step1Done = phrases.length > 0;
  const currentStep = output.length > 0 ? 3 : (step1Done ? 2 : 1);

  // Toasts
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Playback teardown on unmount
  useEffect(() => () => stopPreview(), []);

  // Auto-follow playhead during playback
  useEffect(() => {
    if (!isPlaying || phrases.length === 0) return;
    const cur = phrases.find((p) => playheadTime >= p.startTime && playheadTime <= p.endTime);
    if (cur && cur.id !== selectedPhraseId) setSelectedPhraseId(cur.id);
  }, [isPlaying, playheadTime, phrases, selectedPhraseId]);

  function setupMelody(parsed: ParsedMidi, name: string) {
    const analyzed = analyzeNotes(parsed.notes);
    const detected = detectSections(analyzed);
    setFileName(name);
    setMidiInfo(parsed.info);
    setNotes(parsed.notes);
    setPhrases(analyzed);
    setLocks(analyzed.map((_, i) => parseLockInput('', i)));
    setSectionLabels(detected.length ? detected : analyzed.map((_, i) => (i === 0 ? 'Verse 1' : '')));
    setSelectedPhraseId(analyzed[0]?.id ?? null);
    setOutput([]);
    setPlayheadTime(0);
    stopPreview();
  }

  async function handleFile(file: File | null | undefined) {
    setError('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('File is over the 10 MB limit.');
      return;
    }
    if (!/\.(mid|midi)$/i.test(file.name)) {
      setError('Only .mid / .midi supported in this build.');
      return;
    }
    try {
      const parsed = await parseMidiFile(file);
      setupMelody(parsed, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse the MIDI file.');
    }
  }

  function loadSample() {
    const sample: SampleMelody = buildSampleMelody();
    setupMelody(sample, sample.fileName);
  }

  // Playback
  async function ensureCtx(): Promise<AudioContext> {
    const Ctx = window.AudioContext;
    const ac = audioRef.current ?? new Ctx();
    audioRef.current = ac;
    await ac.resume();
    return ac;
  }

  function stopPreview() {
    playGenRef.current += 1;
    playbackRef.current?.stop();
    playbackRef.current = null;
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    setIsPlaying(false);
  }

  async function togglePreview() {
    if (isPlaying) {
      stopPreview();
      return;
    }
    if (!notes.length) return;
    const myGen = ++playGenRef.current;
    const ac = await ensureCtx();
    if (myGen !== playGenRef.current) return;
    setPlayheadTime(0);
    playbackRef.current = schedulePreview(notes, ac, 0);
    playStartRef.current = performance.now();
    setIsPlaying(true);
    const tick = () => {
      if (myGen !== playGenRef.current) return;
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      if (elapsed >= totalDuration) {
        stopPreview();
        return;
      }
      setPlayheadTime(elapsed);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  async function previewPhrase(phraseIdx: number) {
    stopPreview();
    const phrase = phrases[phraseIdx];
    if (!phrase || !phrase.notes.length) return;
    const myGen = ++playGenRef.current;
    const ac = await ensureCtx();
    if (myGen !== playGenRef.current) return;
    setPlayheadTime(phrase.startTime);
    playbackRef.current = schedulePreview(phrase.notes, ac, phrase.startTime);
    playStartRef.current = performance.now() - phrase.startTime * 1000;
    setIsPlaying(true);
    setSelectedPhraseId(phrase.id);
    const tick = () => {
      if (myGen !== playGenRef.current) return;
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      if (elapsed >= phrase.endTime) {
        stopPreview();
        setPlayheadTime(0);
        return;
      }
      setPlayheadTime(elapsed);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  async function seekAndPlay(time: number) {
    stopPreview();
    if (!notes.length) return;
    const t = Math.max(0, Math.min(totalDuration, time));
    const myGen = ++playGenRef.current;
    const ac = await ensureCtx();
    if (myGen !== playGenRef.current) return;
    setPlayheadTime(t);
    playbackRef.current = schedulePreview(notes, ac, t);
    playStartRef.current = performance.now() - t * 1000;
    setIsPlaying(true);
    const tick = () => {
      if (myGen !== playGenRef.current) return;
      const elapsed = (performance.now() - playStartRef.current) / 1000;
      if (elapsed >= totalDuration) {
        stopPreview();
        return;
      }
      setPlayheadTime(elapsed);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  // Editing
  function updateLockText(idx: number, value: string) {
    setLocks((cur) => cur.map((l, i) => (i === idx ? parseLockInput(value, i, l.policy) : l)));
  }
  function updateLockPolicy(idx: number, policy: LockPolicy) {
    setLocks((cur) => cur.map((l, i) => (i === idx ? { ...l, policy } : l)));
  }
  function clearLock(idx: number) {
    setLocks((cur) => cur.map((l, i) => (i === idx ? parseLockInput('', i, l.policy) : l)));
  }
  function handleSplit(pIdx: number, nIdx: number) {
    const next = splitPhrase(phrases, pIdx, nIdx);
    if (next === phrases) return;
    const nextLabels = [...sectionLabels.slice(0, pIdx + 1), '', ...sectionLabels.slice(pIdx + 1)];
    setPhrases(next);
    setLocks(next.map((_, i) => locks[i] ?? parseLockInput('', i)));
    setSectionLabels(nextLabels);
  }
  function handleMerge(pIdx: number) {
    const next = mergePhrases(phrases, pIdx);
    if (next === phrases) return;
    setPhrases(next);
    setLocks(next.map((_, i) => locks[i] ?? parseLockInput('', i)));
    setSectionLabels(sectionLabels.filter((_, i) => i !== pIdx + 1));
  }
  function setSectionAt(idx: number, value: string) {
    setSectionLabels((cur) => cur.map((s, i) => (i === idx ? value : s)));
  }

  // Generate via the agentic pipeline
  async function generate() {
    setIsGenerating(true);
    setError('');
    setOutput((cur) => cur.map((l) => (l.locked ? l : { text: '', locked: false, validation: null, placeholder: true } as GeneratedLine & { placeholder?: boolean })));
    abortRef.current = new AbortController();

    const pinnedLines = new Map<number, string>();
    output.forEach((line, i) => {
      if (line.locked) pinnedLines.set(i, line.text);
    });

    const llmCall = (promptText: string, signal?: AbortSignal): Promise<string> => {
      const key = apiKey.trim();
      if (!key) {
        return Promise.reject(new Error(`Add a ${llmProvider === 'anthropic' ? 'Anthropic' : llmProvider === 'openai' ? 'OpenAI' : 'DeepSeek'} API key.`));
      }
      const m = model || defaultModelFor(llmProvider);
      if (llmProvider === 'anthropic') return generateWithAnthropic(promptText, key, m, signal);
      if (llmProvider === 'openai') return generateWithOpenAI(promptText, key, m, signal);
      return generateWithDeepSeek(promptText, key, m, signal);
    };

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
      }

      if (!log) return;

      if (log.finalStatus === 'error') {
        setError(log.errorMessage ?? 'Generation failed.');
        setOutput((cur) => cur.filter((l) => !(l as GeneratedLine & { placeholder?: boolean }).placeholder));
        return;
      }

      const final = log.iterations[log.iterations.length - 1];
      if (final) {
        setOutput(final.output.map((text, i) => ({
          text,
          locked: pinnedLines.has(i),
          validation: final.validations[i] ?? null,
        })));
        if (log.finalStatus === 'capped') {
          setToast(`✨ ${final.output.length} lines — some may not perfectly match stress.`);
        } else {
          setToast(`✨ ${final.output.length} lines written — review and lock the ones you like`);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Generation failed.');
      }
      setOutput((cur) => cur.filter((l) => !(l as GeneratedLine & { placeholder?: boolean }).placeholder));
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }

  function copyText(text: string, msg: string) {
    if (!text.trim()) {
      setToast('Nothing to copy.');
      return;
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
    setToast(msg);
  }

  function exportTxt() {
    const lines = output.length ? output.map((l) => l.text).join('\n') : prompt;
    const meta = [
      '# Melody-to-Lyrics Export',
      `File: ${fileName || 'untitled'}`,
      `Date: ${new Date().toISOString()}`,
      `Tempo: ${midiInfo?.tempos.join(', ') || 'n/a'} BPM`,
      `Meter: ${midiInfo ? `${midiInfo.timeSignature[0]}/${midiInfo.timeSignature[1]}` : 'n/a'}`,
      `Prosody: ${phrases.map((p, i) => `L${i + 1} ${p.syllables} ${p.stressPattern}`).join('; ')}`,
      '',
    ].join('\n');
    const blob = new Blob([`${meta}\n${lines}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, '') || 'melody'}-lyrics.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function startOver() {
    setFileName('');
    setMidiInfo(null);
    setNotes([]);
    setPhrases([]);
    setLocks([]);
    setSectionLabels([]);
    setOutput([]);
    setSelectedPhraseId(null);
    setPlayheadTime(0);
    stopPreview();
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><I.music /></div>
          <div className="brand-text">
            <span className="brand-name">Melody to Lyrics</span>
            <span className="brand-sub">Prosody-aware lyric studio</span>
          </div>
        </div>

        {step1Done && (
          <div className="steps">
            <div className={`step ${currentStep === 1 ? 'active' : 'done'}`}><span className="num">1</span>Upload</div>
            <div className="step-divider" />
            <div className={`step ${currentStep === 2 ? 'active' : currentStep > 2 ? 'done' : ''}`}><span className="num">2</span>Shape</div>
            <div className="step-divider" />
            <div className={`step ${currentStep === 3 ? 'active' : ''}`}><span className="num">3</span>Write</div>
          </div>
        )}

        <div className="header-right">
          {step1Done && (
            <button type="button" className="btn ghost tiny" onClick={startOver}>
              <I.reset /> Start over
            </button>
          )}
        </div>
      </header>

      <main>
        {!step1Done ? (
          <EmptyState onFile={handleFile} onSample={loadSample} error={error} />
        ) : (
          <>
            <SongBar
              fileName={fileName}
              midiInfo={midiInfo}
              isPlaying={isPlaying}
              onTogglePlay={togglePreview}
              playheadTime={playheadTime}
              totalDuration={totalDuration}
            />

            {error && <div className="error-banner"><I.x /> {error}</div>}

            {isGenerating && (
              <div className="writing-banner">
                <span className="pulse" />
                <span className="text">Writing lyrics to your melody…</span>
                <span style={{ flex: 1 }} />
                <span className="small">{phrases.length} lines</span>
                <button type="button" className="btn ghost tiny" onClick={() => abortRef.current?.abort()}>Cancel</button>
              </div>
            )}

            {output.length > 0 && !isGenerating && (
              <div className="lyrics-actions">
                <span className="lyrics-actions-label">
                  <I.sparkle /> {output.length} lines generated · edit any line below to lock it
                </span>
                <span className="grow" />
                <button type="button" className="btn ghost tiny" onClick={() => setOutput((o) => o.map((l) => ({ ...l, locked: true })))}><I.lock /> Lock all</button>
                <button type="button" className="btn ghost tiny" onClick={() => setOutput((o) => o.map((l) => ({ ...l, locked: false })))}><I.unlock /> Unlock all</button>
                <button type="button" className="btn ghost tiny" onClick={() => copyText(output.map((l) => l.text).join('\n'), 'Lyrics copied.')}><I.copy /> Copy</button>
                <button type="button" className="btn ghost tiny" onClick={exportTxt}><I.download /> Export .txt</button>
                <button type="button" className="btn ghost tiny" onClick={() => setOutput([])}><I.x /> Clear</button>
              </div>
            )}

            <div className="workspace">
              {/* LEFT: Step 2 — Shape */}
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <span className="step-num">Step 2</span>
                    <h2 style={{ display: 'inline' }}>Shape the lyric</h2>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() => setLocks(phrases.map((_, i) => parseLockInput('', i)))}
                    >Clear all locks</button>
                  </div>
                </div>

                {/* Sticky toolbar */}
                <div className="roll-toolbar">
                  <div className="tb-group">
                    <button type="button" className="btn icon-only" title="Play full melody" onClick={togglePreview}>
                      {isPlaying ? <I.pause /> : <I.play />}
                    </button>
                    <button
                      type="button"
                      className="btn icon-only"
                      title="Stop"
                      onClick={() => { stopPreview(); setPlayheadTime(0); }}
                      disabled={!isPlaying}
                    ><I.stop /></button>
                    {selectedPhrase && (
                      <button
                        type="button"
                        className="btn icon-only"
                        title={`Play line ${selectedPhraseIdx + 1}`}
                        onClick={() => previewPhrase(selectedPhraseIdx)}
                      ><I.playLine /></button>
                    )}
                  </div>
                  <div className="tb-divider" />
                  <div className="tb-group">
                    <span className="tb-label">
                      {selectedPhrase
                        ? `Line ${selectedPhraseIdx + 1}${sectionLabels[selectedPhraseIdx] ? ` · ${sectionLabels[selectedPhraseIdx]}` : ''}`
                        : 'Select a line'}
                    </span>
                    {selectedPhrase && (
                      <>
                        <button
                          type="button"
                          className="btn icon-only"
                          title="Previous line"
                          disabled={selectedPhraseIdx === 0}
                          onClick={() => setSelectedPhraseId(phrases[selectedPhraseIdx - 1].id)}
                        ><I.chevronLeft /></button>
                        <button
                          type="button"
                          className="btn icon-only"
                          title="Next line"
                          disabled={selectedPhraseIdx >= phrases.length - 1}
                          onClick={() => setSelectedPhraseId(phrases[selectedPhraseIdx + 1].id)}
                        ><I.chevron /></button>
                        <div className="tb-divider" />
                        <div className="section-picker">
                          <select
                            className="tb-select"
                            value={(sectionLabels[selectedPhraseIdx] || '').replace(/\s\d+$/, '')}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '__remove') setSectionAt(selectedPhraseIdx, '');
                              else setSectionAt(selectedPhraseIdx, v);
                            }}
                            title="Section label"
                          >
                            <option value="">— No section —</option>
                            {SECTION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                            {sectionLabels[selectedPhraseIdx] && <option value="__remove">Remove section</option>}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="btn ghost small"
                          title="Merge this line with the next"
                          disabled={selectedPhraseIdx >= phrases.length - 1}
                          onClick={() => handleMerge(selectedPhraseIdx)}
                        ><I.merge /> Merge</button>
                        <button
                          type="button"
                          className="btn ghost small"
                          title="Split this line in half"
                          disabled={selectedPhrase.notes.length < 2}
                          onClick={() => handleSplit(selectedPhraseIdx, Math.floor(selectedPhrase.notes.length / 2))}
                        ><I.cut /> Split</button>
                      </>
                    )}
                  </div>
                  <span className="grow" />
                  <span className="tb-meta">{phrases.length} lines · {notes.length} notes · {totalDuration.toFixed(1)}s</span>
                </div>

                <div className="panel-body">
                  <PianoRoll
                    phrases={phrases}
                    notes={notes}
                    selectedPhraseId={selectedPhraseId}
                    onSelectPhrase={setSelectedPhraseId}
                    onSplit={handleSplit}
                    onSeek={seekAndPlay}
                    playheadTime={playheadTime}
                    isPlaying={isPlaying}
                  />

                  {selectedPhrase && (
                    <ActiveLine
                      key={selectedPhrase.id}
                      phrase={selectedPhrase}
                      idx={selectedPhraseIdx}
                      total={phrases.length}
                      sectionLabel={sectionLabels[selectedPhraseIdx]}
                      isPhrasePlaying={isPlaying && playheadTime >= selectedPhrase.startTime && playheadTime <= selectedPhrase.endTime}
                      onPreview={() => previewPhrase(selectedPhraseIdx)}
                      lockRawInput={selectedLock?.rawInput ?? ''}
                      output={output[selectedPhraseIdx]}
                      isGenerating={isGenerating}
                      onCommit={(text) => {
                        if (output[selectedPhraseIdx]) {
                          setOutput((o) => o.map((l, j) => (
                            j === selectedPhraseIdx
                              ? { ...l, text, locked: true, validation: null }
                              : l
                          )));
                        } else {
                          updateLockText(selectedPhraseIdx, text);
                        }
                      }}
                      onClear={() => {
                        if (output[selectedPhraseIdx]) {
                          setOutput((o) => o.map((l, j) => (
                            j === selectedPhraseIdx
                              ? { ...l, text: '', locked: false }
                              : l
                          )));
                        } else {
                          clearLock(selectedPhraseIdx);
                        }
                      }}
                      onToggleLock={() => setOutput((o) => o.map((l, j) => (
                        j === selectedPhraseIdx ? { ...l, locked: !l.locked } : l
                      )))}
                    />
                  )}

                  {selectedPhrase && selectedLock && selectedLock.rawInput.trim()
                    && selectedLock.totalSyllables !== selectedPhrase.syllables
                    && !output[selectedPhraseIdx]?.text && (
                    <div className="lock-warning">
                      <I.x />
                      <span>
                        Your line has {selectedLock.totalSyllables} syllables, but the melody needs {selectedPhrase.syllables}.
                      </span>
                      <select
                        value={selectedLock.policy}
                        onChange={(e) => updateLockPolicy(selectedPhraseIdx, e.target.value as LockPolicy)}
                        title="What should the AI do for this line?"
                      >
                        <option value="strict">Don&apos;t generate (I&apos;ll fix it)</option>
                        <option value="trim">AI: trim my line to fit</option>
                        <option value="pad">AI: pad my line to fit</option>
                        <option value="auto">AI: decide</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Step 3 — Styles */}
              <div className="panel panel-sticky">
                <div className="panel-head">
                  <div>
                    <span className="step-num">Step 3</span>
                    <h2 style={{ display: 'inline' }}>Styles</h2>
                  </div>
                </div>

                <div className="section-card">
                  <p className="blurb" style={{ marginTop: 0 }}>
                    Describe the song in your own words — genre, vocal, mood, theme. The whole block is sent to the model.
                  </p>
                  <textarea
                    className="direction-box"
                    value={context.direction ?? ''}
                    onChange={(e) => setContext({ ...context, direction: e.target.value })}
                    placeholder="indie folk, female vocal, warm and intimate, theme of leaving home…"
                    spellCheck={false}
                  />
                  <div className="direction-actions">
                    <button type="button" className="btn ghost tiny" onClick={() => setContext({ ...context, direction: '' })}>Clear</button>
                    <button type="button" className="btn ghost tiny" onClick={() => setContext({ ...context, direction: DIRECTION_TEMPLATE })}>Reset to template</button>
                    <span style={{ flex: 1 }} />
                    <span className="lbl" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{(context.direction ?? '').length} chars</span>
                  </div>

                  <div className="tag-pool">
                    {STYLE_TAGS.map((t) => {
                      const active = (context.direction ?? '').toLowerCase().includes(t.toLowerCase());
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`tag-chip ${active ? 'active' : ''}`}
                          onClick={() => {
                            if (active) return;
                            const cur = context.direction ?? '';
                            const sep = !cur || cur.endsWith('\n') || cur.endsWith(' ') || cur.endsWith(',') ? '' : ' ';
                            const punct = cur && !cur.endsWith('\n') && !cur.endsWith(',') ? ',' : '';
                            const trailingSpace = cur && !cur.endsWith('\n') ? ' ' : '';
                            setContext({ ...context, direction: cur + punct + sep + trailingSpace + t });
                          }}
                          title={active ? 'Already in your direction' : 'Click to add'}
                        >
                          {active && <span className="check">✓</span>}{t}
                        </button>
                      );
                    })}
                  </div>

                  <div className="constraint-row">
                    <div className="field" style={{ flex: 1.4 }}>
                      <label>Rhyme strategy</label>
                      <select
                        value={
                          context.rhymeScheme === 'SECTION' || context.rhymeScheme === 'FREE'
                            ? context.rhymeScheme
                            : 'CUSTOM'
                        }
                        onChange={(e) => setContext({
                          ...context,
                          rhymeScheme: e.target.value === 'CUSTOM' ? 'ABAB' : e.target.value,
                        })}
                      >
                        <option value="SECTION">Section families — each section gets its own rhyme lane</option>
                        <option value="CUSTOM">Fixed pattern — repeat per line (ABAB, AABB…)</option>
                        <option value="FREE">No fixed rhyme — slant &amp; internal only</option>
                      </select>
                      <small className="field-help">
                        {context.rhymeScheme === 'SECTION' && 'Verses share one rhyme family, choruses share another. Most natural for pop/folk.'}
                        {context.rhymeScheme === 'FREE' && 'Model leans on assonance, consonance, internal echoes — no forced end rhyme.'}
                        {!['SECTION', 'FREE'].includes(context.rhymeScheme) && 'Strict end-rhyme by line position. Best for hymn-like or tightly-structured lyrics.'}
                      </small>
                    </div>
                    {!['SECTION', 'FREE'].includes(context.rhymeScheme) && (
                      <div className="field" style={{ flex: 1 }}>
                        <label>Pattern</label>
                        <input
                          value={context.rhymeScheme}
                          onChange={(e) => setContext({ ...context, rhymeScheme: e.target.value })}
                          placeholder="ABAB"
                        />
                      </div>
                    )}
                    <div className="toggle-row" style={{ flex: 1 }}>
                      <div className="lbl-stack">
                        <span>Strict syllables</span>
                        <small>Off = ±1 allowed</small>
                      </div>
                      <button
                        type="button"
                        className={`toggle ${context.strictSyllables ? 'on' : ''}`}
                        onClick={() => setContext({ ...context, strictSyllables: !context.strictSyllables })}
                      />
                    </div>
                  </div>
                </div>

                <div className="generate-bar">
                  <select
                    value={llmProvider}
                    onChange={(e) => {
                      const p = e.target.value as LlmProvider;
                      setLlmProvider(p);
                      setModel(defaultModelFor(p));
                    }}
                    style={{ background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)', padding: '7px 10px', borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 11 }}
                  >
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                  </select>
                  <input
                    className="api-key"
                    type="text"
                    placeholder="Model ID"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{ width: 160 }}
                  />
                  <input
                    className="api-key"
                    type="password"
                    placeholder="API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <span className="grow" />
                  {strictMismatch && <span className="warning-pill"><I.x /> Strict mismatch</span>}
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!phrases.length || strictMismatch || isGenerating}
                    onClick={generate}
                  >
                    <I.wand /> {isGenerating ? 'Writing…' : (output.length ? 'Regenerate' : 'Generate lyrics')}
                  </button>
                  {isGenerating && (
                    <button type="button" className="btn ghost small" onClick={() => abortRef.current?.abort()}>Cancel</button>
                  )}
                </div>

                <details className="prompt-drawer" open={tweaks.showPrompt}>
                  <summary>
                    <span>View raw prompt</span>
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={(e) => { e.preventDefault(); copyText(prompt, 'Prompt copied.'); }}
                    ><I.copy /> Copy</button>
                  </summary>
                  <pre>{prompt}</pre>
                </details>
              </div>
            </div>

            {/* Full lyrics card */}
            {output.length > 0 && output.some((o) => o?.text) && (
              <div className="panel full-lyrics">
                <div className="panel-head">
                  <div>
                    <span className="step-num">Result</span>
                    <h2 style={{ display: 'inline' }}>Full lyrics</h2>
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn ghost small"
                      title="Copy all lyrics to clipboard"
                      onClick={() => {
                        const lines = output.map((o, i) => {
                          const sec = sectionLabels[i];
                          const prefix = sec ? `\n[${sec}]\n` : '';
                          return prefix + (o?.text ?? '');
                        }).join('\n').trim();
                        copyText(lines, 'Lyrics copied.');
                      }}
                    ><I.copy /> Copy all</button>
                    <button
                      type="button"
                      className="btn ghost small"
                      title="Lock every line"
                      onClick={() => setOutput((o) => o.map((l) => (l ? { ...l, locked: true } : l)))}
                    ><I.lock /> Lock all</button>
                  </div>
                </div>
                <div className="full-lyrics-body">
                  {phrases.map((phrase, i) => {
                    const o = output[i];
                    const text = o?.text ?? '';
                    const userSyl = text ? countSyllables(text) : 0;
                    const target = phrase.syllables;
                    const sylDelta = userSyl - target;
                    const sylStatus = !text ? 'empty' : sylDelta === 0 ? 'match' : Math.abs(sylDelta) === 1 ? 'close' : 'off';
                    const isActive = phrase.id === selectedPhraseId;
                    const sec = sectionLabels[i];
                    return (
                      <Fragment key={phrase.id}>
                        {sec && <div className="fl-section">{sec}</div>}
                        <div
                          className={`fl-row ${isActive ? 'active' : ''} ${o?.locked ? 'locked' : ''}`}
                          onClick={() => setSelectedPhraseId(phrase.id)}
                        >
                          <div className="fl-num">{i + 1}</div>
                          <input
                            className="fl-text"
                            type="text"
                            value={text}
                            placeholder="(not generated)"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setOutput((cur) => cur.map((l, j) => (
                              j === i
                                ? { ...(l ?? { text: '', locked: false, validation: null }), text: e.target.value, locked: true }
                                : l
                            )))}
                            spellCheck={false}
                          />
                          <span className={`fl-syl ${sylStatus}`} title={`${userSyl} of ${target} syllables`}>
                            {userSyl}/{target}
                          </span>
                          <button
                            type="button"
                            className={`fl-lock ${o?.locked ? 'on' : ''}`}
                            title={o?.locked ? "Locked — won't change on regenerate" : 'Unlocked — will regenerate'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOutput((cur) => cur.map((l, j) => (
                                j === i
                                  ? { ...(l ?? { text: '', locked: false, validation: null }), locked: !l?.locked }
                                  : l
                              )));
                            }}
                          >{o?.locked ? <I.lock /> : <I.unlock />}</button>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}

      <TweaksPanel title="Tweaks">
        <TweakSection title="Visual">
          <TweakSelect
            label="Theme"
            value={tweaks.theme}
            onChange={(v) => setTweak('theme', v as typeof tweaks.theme)}
            options={[
              { value: 'editorial', label: 'Editorial (rose pink)' },
              { value: 'studio', label: 'Studio (cool blue)' },
              { value: 'paper', label: 'Paper (light)' },
            ]}
          />
          <TweakSelect
            label="Display font"
            value={tweaks.fontDisplay}
            onChange={(v) => setTweak('fontDisplay', v as typeof tweaks.fontDisplay)}
            options={[
              { value: 'Fraunces', label: 'Fraunces' },
              { value: 'Cormorant Garamond', label: 'Cormorant' },
              { value: 'Playfair Display', label: 'Playfair' },
              { value: 'EB Garamond', label: 'EB Garamond' },
            ]}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={(v) => setTweak('density', v as typeof tweaks.density)}
            options={[
              { value: 'comfortable', label: 'Comfy' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </TweakSection>
        <TweakSection title="Behavior">
          <TweakToggle label="Show prompt by default" value={tweaks.showPrompt} onChange={(v) => setTweak('showPrompt', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ============================================================
// Empty state
// ============================================================
function EmptyState({ onFile, onSample, error }: {
  onFile: (file: File | null | undefined) => void;
  onSample: () => void;
  error: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="empty-hero">
      <div>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>Three steps · Upload, Shape, Write</div>
        <h1>Lyrics that <em>belong</em> to your melody.</h1>
        <p>Drop a MIDI file. We&apos;ll find the phrases, count the syllables, and mark the strong beats — then you write lyrics that fit, with locked words preserved verbatim.</p>

        <label
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
        >
          <div className="drop-icon"><I.upload /></div>
          <strong>Drop a MIDI melody</strong>
          <span>or click to browse · .mid / .midi · up to 10 MB</span>
          <input type="file" accept=".mid,.midi" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>

        <div className="empty-actions">
          <button type="button" className="text-link" onClick={onSample}>
            <I.sparkle /> Try a sample melody
          </button>
        </div>

        {error && (
          <div className="error-banner" style={{ maxWidth: 540, margin: '20px auto 0' }}>
            <I.x /> {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Song bar (after upload)
// ============================================================
function SongBar({ fileName, midiInfo, isPlaying, onTogglePlay, playheadTime, totalDuration }: {
  fileName: string;
  midiInfo: MidiFileInfo | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playheadTime: number;
  totalDuration: number;
}) {
  return (
    <div className="song-bar">
      <span className="file-name">{fileName}</span>
      {midiInfo && (
        <div className="midi-meta">
          <span>{midiInfo.tempos.join(', ')} BPM</span>
          <span>{midiInfo.timeSignature[0]}/{midiInfo.timeSignature[1]}</span>
          <span>{midiInfo.trackName}</span>
        </div>
      )}
      <span className="spacer" />
      <div className="play-area">
        <button type="button" className="btn small" onClick={onTogglePlay}>{isPlaying ? <I.pause /> : <I.play />}</button>
        <div className="scrub">
          <div className="scrub-fill" style={{ width: `${totalDuration ? (playheadTime / totalDuration) * 100 : 0}%` }} />
        </div>
        <span className="timecode">{fmtTime(playheadTime)} / {fmtTime(totalDuration)}</span>
      </div>
    </div>
  );
}

// ============================================================
// Active line — focus mode below the piano roll
// ============================================================
function ActiveLine({
  phrase, idx, total, sectionLabel, isPhrasePlaying, onPreview,
  lockRawInput, output, isGenerating, onCommit, onClear, onToggleLock,
}: {
  phrase: Phrase;
  idx: number;
  total: number;
  sectionLabel: string | undefined;
  isPhrasePlaying: boolean;
  onPreview: () => void;
  lockRawInput: string;
  output: GeneratedLine | undefined;
  isGenerating: boolean;
  onCommit: (text: string) => void;
  onClear: () => void;
  onToggleLock: () => void;
}) {
  const currentLine = output?.text ?? lockRawInput;
  const userSyllables = currentLine ? countSyllables(currentLine) : 0;
  const target = phrase.syllables;
  const sylDelta = userSyllables - target;
  const sylStatus: 'empty' | 'match' | 'close' | 'off' = !currentLine
    ? 'empty'
    : sylDelta === 0
      ? 'match'
      : Math.abs(sylDelta) === 1
        ? 'close'
        : 'off';
  const isGeneratingHere = isGenerating && !output?.text;
  const isAILine = !!output?.text;

  const words = currentLine ? splitLineSyllables(currentLine) : [];
  const flat: Array<{ syl: string; wordStart: boolean; wordEnd: boolean; wordIdx: number }> = [];
  words.forEach((w, wi) => {
    w.syllables.forEach((s, si) => {
      flat.push({
        syl: s,
        wordStart: si === 0,
        wordEnd: si === w.syllables.length - 1,
        wordIdx: wi,
      });
    });
  });

  return (
    <div className="active-line">
      <div className="active-line-head">
        <button
          type="button"
          className="phrase-play"
          title="Play this line"
          onClick={onPreview}
        >
          {isPhrasePlaying ? <I.pause /> : <I.play />}
        </button>
        <div className="al-title">
          <strong>Line {idx + 1}</strong>
          <span className="al-of">of {total}</span>
          {sectionLabel && <span className="al-section-tag">{sectionLabel}</span>}
        </div>
        <span className="grow" />
        <span className={`syllable-counter ${sylStatus}`}>
          {sylStatus === 'match' && <I.check />}
          {sylStatus === 'off' && <I.x />}
          <strong>{userSyllables}</strong>
          <span className="sep">/</span>
          <strong>{target}</strong>
          <span className="lbl">syllables</span>
        </span>
      </div>

      <div className="al-help">
        The melody wants <strong>{target} syllables</strong>. Type any line — words auto-flow into the slots below, one syllable per beat.
      </div>

      <div className={`line-editor ${sylStatus}`}>
        {isGeneratingHere ? (
          <div className="line-editor-skeleton">
            <div className="skeleton-bar" />
            <span className="skeleton-label">writing line {idx + 1}…</span>
          </div>
        ) : (
          <>
            {isAILine && output && (
              <button
                type="button"
                className={`lock-toggle inline ${output.locked ? 'on' : ''}`}
                title={output.locked ? "Locked — won't change on regenerate" : 'Unlocked — will regenerate'}
                onClick={onToggleLock}
              >
                {output.locked ? <I.lock /> : <I.unlock />}
              </button>
            )}
            <input
              className="line-editor-input"
              type="text"
              value={currentLine}
              placeholder={'Type your own line, or leave blank and click "Generate lyrics" →'}
              onChange={(e) => onCommit(e.target.value)}
              spellCheck={false}
            />
            {currentLine && (
              <button
                type="button"
                className="line-editor-clear"
                title="Clear this line"
                onClick={onClear}
              >×</button>
            )}
          </>
        )}
      </div>

      <div className="slot-row">
        {phrase.notes.map((n, k) => {
          const piece = flat[k];
          return (
            <div
              key={k}
              className={`slot ${n.stress === 'S' ? 'strong' : 'weak'} ${piece ? 'filled' : 'empty'} ${piece?.wordStart ? 'word-start' : ''} ${piece?.wordEnd ? 'word-end' : ''}`}
              title={`Beat ${k + 1} · ${n.stress === 'S' ? 'strong (emphasized)' : 'weak (unstressed)'}`}
            >
              <span className="slot-stress">{n.stress === 'S' ? 'S' : 'w'}</span>
              <span className="slot-text">{piece ? piece.syl : '·'}</span>
            </div>
          );
        })}
        {flat.slice(target).map((piece, k) => (
          <div key={`over-${k}`} className="slot overflow" title="Extra syllable — beyond the melody">
            <span className="slot-stress">!</span>
            <span className="slot-text">{piece.syl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
