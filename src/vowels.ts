export type ArpabetVowel =
  | 'AA' | 'AE' | 'AH' | 'AO' | 'AW' | 'AY'
  | 'EH' | 'ER' | 'EY'
  | 'IH' | 'IY'
  | 'OW' | 'OY'
  | 'UH' | 'UW';

const OPEN_SET: ReadonlySet<ArpabetVowel> = new Set([
  'EY', 'AY', 'OW', 'AW', 'AA', 'AO', 'OY', 'UW', 'IY',
]);

export function isOpenVowel(vowel: ArpabetVowel): boolean {
  return OPEN_SET.has(vowel);
}

const FINAL_VOWELS: Record<string, ArpabetVowel> = {
  // -EY (day, way, stay)
  day: 'EY', way: 'EY', stay: 'EY', away: 'EY', today: 'EY', say: 'EY',
  pay: 'EY', play: 'EY', okay: 'EY', maybe: 'IY',

  // -AY (sky, fly, try, eye)
  sky: 'AY', fly: 'AY', try: 'AY', eye: 'AY', why: 'AY', high: 'AY',
  cry: 'AY', goodbye: 'AY', tonight: 'AY', light: 'AY', night: 'AY',
  bright: 'AY', ignite: 'AY', alright: 'AY', fight: 'AY', sight: 'AY',
  mine: 'AY', line: 'AY', time: 'AY', mind: 'AY', find: 'AY',

  // -OW (slow, road, gold, alone, gone)
  slow: 'OW', road: 'OW', gold: 'OW', know: 'OW', go: 'OW', so: 'OW',
  alone: 'OW', soul: 'OW', control: 'OW', hold: 'OW', cold: 'OW',
  home: 'OW', ago: 'OW', tomorrow: 'OW',

  // -UW (you, do, blue, true)
  you: 'UW', do: 'UW', blue: 'UW', true: 'UW', through: 'UW', view: 'UW',
  too: 'UW', who: 'UW', new: 'UW', knew: 'UW', few: 'UW',

  // -IY (see, free, me, three, dream)
  see: 'IY', free: 'IY', me: 'IY', three: 'IY', dream: 'IY', scheme: 'IY',
  be: 'IY', we: 'IY', he: 'IY', she: 'IY', key: 'IY', sea: 'IY',
  believe: 'IY',

  // -AW (now, down, how)
  now: 'AW', down: 'AW', how: 'AW', around: 'AW', sound: 'AW',

  // -AA (far, heart, start, are)
  far: 'AA', heart: 'AA', start: 'AA', are: 'AA', star: 'AA', dark: 'AA',
  hard: 'AA',

  // -AO (saw, fall, all, call)
  saw: 'AO', fall: 'AO', all: 'AO', call: 'AO', small: 'AO', tall: 'AO',
  ball: 'AO', wall: 'AO', talk: 'AO',

  // -OY (boy, joy)
  boy: 'OY', joy: 'OY', toy: 'OY', destroy: 'OY',

  // closed / reduced (counter-examples — held-unfriendly)
  love: 'AH', above: 'AH', enough: 'AH',
  it: 'IH', this: 'IH', wish: 'IH',
  her: 'ER', word: 'ER', heard: 'ER',
  good: 'UH', could: 'UH', should: 'UH',
  red: 'EH', said: 'EH',
  bad: 'AE', back: 'AE', sad: 'AE',
};

export function finalVowel(word: string): ArpabetVowel | null {
  const cleaned = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!cleaned) return null;
  return FINAL_VOWELS[cleaned] ?? null;
}
