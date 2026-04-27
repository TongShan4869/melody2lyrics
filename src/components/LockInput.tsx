import type { LockPolicy, Phrase, PhraseLockState } from '../types';

type Props = {
  phrase: Phrase;
  lock: PhraseLockState;
  onInputChange: (value: string) => void;
  onPolicyChange: (policy: LockPolicy) => void;
  onClear: () => void;
};

const policies: Array<{ value: LockPolicy; label: string }> = [
  { value: 'strict', label: 'Strict' },
  { value: 'trim', label: 'Trim' },
  { value: 'pad', label: 'Pad' },
  { value: 'auto', label: 'Auto' },
];

export function LockInput({ phrase, lock, onInputChange, onPolicyChange, onClear }: Props) {
  const mismatch = lock.rawInput.trim() && lock.totalSyllables !== phrase.syllables;
  const counterClass = mismatch ? 'counter warning' : 'counter ok';

  return (
    <div className="lock-input">
      <div className="lock-row">
        <input
          aria-label={`Locked lyric template for phrase ${lock.phraseIndex + 1}`}
          value={lock.rawInput}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="_ _ love _ _ you tonight"
        />
        <select
          aria-label={`Mismatch policy for phrase ${lock.phraseIndex + 1}`}
          value={lock.policy}
          onChange={(event) => onPolicyChange(event.target.value as LockPolicy)}
        >
          {policies.map((policy) => (
            <option key={policy.value} value={policy.value}>
              {policy.label}
            </option>
          ))}
        </select>
        <button type="button" className="ghost small" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className={counterClass}>
        {lock.rawInput.trim() ? lock.totalSyllables : phrase.syllables}/{phrase.syllables} syllables
        {mismatch ? ' - mismatch' : ' - ok'}
      </div>
    </div>
  );
}
