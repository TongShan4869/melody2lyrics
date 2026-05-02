import { useEffect, useRef, useState, type ReactNode } from 'react';
import { I } from './Icons';

export type ThemeKey = 'editorial' | 'studio' | 'paper';
export type FontKey = 'Fraunces' | 'Cormorant Garamond' | 'Playfair Display' | 'EB Garamond';
export type DensityKey = 'comfortable' | 'compact';

export type Tweaks = {
  theme: ThemeKey;
  fontDisplay: FontKey;
  density: DensityKey;
  showPrompt: boolean;
};

export const TWEAK_DEFAULTS: Tweaks = {
  theme: 'editorial',
  fontDisplay: 'Fraunces',
  density: 'comfortable',
  showPrompt: false,
};

type ThemeVars = Record<string, string>;

const THEMES: Record<ThemeKey, { name: string; vars: ThemeVars }> = {
  editorial: {
    name: 'Editorial',
    vars: {
      '--bg': '#0e0d0c',
      '--surface': '#15140f',
      '--surface-2': '#1c1a16',
      '--surface-3': '#262219',
      '--border': 'rgba(244, 184, 200, 0.16)',
      '--border-strong': 'rgba(244, 184, 200, 0.36)',
      '--ink': '#f5ecec',
      '--ink-muted': '#a89595',
      '--ink-faint': '#5a4d4d',
      '--accent': '#f5b8c8',
      '--accent-2': '#fcd5df',
      '--accent-ink': '#1a0e12',
      '--strong': '#fcd5df',
      '--weak': '#5a4d4d',
      '--lock': '#f5b8c8',
      '--free': 'rgba(245, 184, 200, 0.22)',
      '--danger': '#e89a8c',
      '--ok': '#a8c089',
      '--display': '"Fraunces", "Cormorant Garamond", Georgia, serif',
      '--body': '"Inter Tight", Inter, system-ui, sans-serif',
      '--mono': '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
    },
  },
  studio: {
    name: 'Studio',
    vars: {
      '--bg': '#0a0b0d',
      '--surface': '#101216',
      '--surface-2': '#161920',
      '--surface-3': '#1f242e',
      '--border': 'rgba(255, 255, 255, 0.08)',
      '--border-strong': 'rgba(255, 255, 255, 0.18)',
      '--ink': '#e7eaf0',
      '--ink-muted': '#8a92a0',
      '--ink-faint': '#4a5160',
      '--accent': '#8ec5ff',
      '--accent-2': '#b8dbff',
      '--accent-ink': '#0a0b0d',
      '--strong': '#b8dbff',
      '--weak': '#3a4150',
      '--lock': '#8ec5ff',
      '--free': 'rgba(142, 197, 255, 0.18)',
      '--danger': '#ff9a9a',
      '--ok': '#9ed6a8',
      '--display': '"Fraunces", Georgia, serif',
      '--body': '"Inter Tight", Inter, system-ui, sans-serif',
      '--mono': '"JetBrains Mono", ui-monospace, monospace',
    },
  },
  paper: {
    name: 'Paper',
    vars: {
      '--bg': '#f6f1e7',
      '--surface': '#fbf7ee',
      '--surface-2': '#f1ecdf',
      '--surface-3': '#e8e0cd',
      '--border': 'rgba(40, 30, 20, 0.14)',
      '--border-strong': 'rgba(40, 30, 20, 0.32)',
      '--ink': '#1a1611',
      '--ink-muted': '#6b6052',
      '--ink-faint': '#a89e8b',
      '--accent': '#c2410c',
      '--accent-2': '#9a3412',
      '--accent-ink': '#fbf7ee',
      '--strong': '#1a1611',
      '--weak': '#bbb09a',
      '--lock': '#c2410c',
      '--free': 'rgba(194, 65, 12, 0.16)',
      '--danger': '#b91c1c',
      '--ok': '#3f6212',
      '--display': '"Fraunces", Georgia, serif',
      '--body': '"Inter Tight", Inter, system-ui, sans-serif',
      '--mono': '"JetBrains Mono", ui-monospace, monospace',
    },
  },
};

export function applyTheme(themeKey: ThemeKey): void {
  const theme = THEMES[themeKey] ?? THEMES.editorial;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
}

const STORAGE_KEY = 'melody2lyrics:tweaks';

function loadTweaks(): Tweaks {
  if (typeof window === 'undefined') return TWEAK_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return TWEAK_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Tweaks>;
    return { ...TWEAK_DEFAULTS, ...parsed };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

function saveTweaks(tweaks: Tweaks): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
  } catch {
    // ignore quota errors
  }
}

export function useTweaks(): [Tweaks, (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => void] {
  const [values, setValues] = useState<Tweaks>(() => loadTweaks());

  const setTweak = (key: keyof Tweaks, value: Tweaks[keyof Tweaks]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value } as Tweaks;
      saveTweaks(next);
      return next;
    });
  };

  return [values, setTweak];
}

type TweaksPanelProps = {
  title?: string;
  children: ReactNode;
};

export function TweaksPanel({ title = 'Tweaks', children }: TweaksPanelProps) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  useEffect(() => {
    if (!open) return;
    const panel = dragRef.current;
    if (!panel) return;
    const clamp = () => {
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
      const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
      offsetRef.current = {
        x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
        y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
      };
      panel.style.right = `${offsetRef.current.x}px`;
      panel.style.bottom = `${offsetRef.current.y}px`;
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [open]);

  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev: MouseEvent) => {
      offsetRef.current = {
        x: Math.max(PAD, startRight - (ev.clientX - sx)),
        y: Math.max(PAD, startBottom - (ev.clientY - sy)),
      };
      panel.style.right = `${offsetRef.current.x}px`;
      panel.style.bottom = `${offsetRef.current.y}px`;
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <>
      <button type="button" className="tweaks-launcher" onClick={() => setOpen((o) => !o)} title="Tweaks">
        <I.settings />
      </button>
      {open && (
        <div
          ref={dragRef}
          className="twk-panel"
          style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}
        >
          <div className="twk-hd" onMouseDown={onDragStart}>
            <b>{title}</b>
            <button className="twk-x" aria-label="Close tweaks" onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="twk-body">{children}</div>
        </div>
      )}
    </>
  );
}

type SelectOpt = { value: string; label: string };

export function TweakSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="twk-sect">{title}</div>
      {children}
    </>
  );
}

export function TweakSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: SelectOpt[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function TweakRadio({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: SelectOpt[];
  onChange: (value: string) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div className="twk-seg" role="radiogroup">
        <div
          className="twk-seg-thumb"
          style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`, width: `calc((100% - 4px) / ${n})` }}
        />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TweakToggle({ label, value, onChange }: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button
        type="button"
        className="twk-toggle"
        data-on={value ? '1' : '0'}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
