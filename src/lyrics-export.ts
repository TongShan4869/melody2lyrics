import type { GeneratedLine } from './types';

export function formatLyricsForCopy(
  output: (GeneratedLine | null)[],
  sectionLabels: string[],
): string {
  if (!output.some((o) => o?.text)) return '';

  const parts: string[] = [];
  let prevSection: string | null = null;

  for (let i = 0; i < output.length; i++) {
    const sec = sectionLabels[i] ?? '';
    const text = output[i]?.text ?? '';
    if (sec && sec !== prevSection) {
      if (parts.length > 0) parts.push('');
      parts.push(`[${sec}]`);
    }
    parts.push(text);
    prevSection = sec || prevSection;
  }

  return parts.join('\n');
}
