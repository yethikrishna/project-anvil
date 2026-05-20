'use client';

import {useState, useEffect, useCallback} from 'react';

// ── Types ──

export interface ThemeConfig {
  name: string;
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    danger: string;
  };
  fonts: {
    sans: string;
    mono: string;
  };
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

// ── Preset Themes ──

export const THEME_PRESETS: ThemeConfig[] = [
  {
    name: 'Default Light',
    mode: 'light',
    colors: {
      primary: '#3b82f6', primaryHover: '#2563eb', secondary: '#6366f1',
      accent: '#8b5cf6', background: '#ffffff', surface: '#f9fafb',
      text: '#111827', textSecondary: '#6b7280', border: '#e5e7eb',
      success: '#10b981', warning: '#f59e0b', danger: '#ef4444',
    },
    fonts: {sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace'},
    radius: 'lg',
  },
  {
    name: 'Ocean Dark',
    mode: 'dark',
    colors: {
      primary: '#3b82f6', primaryHover: '#60a5fa', secondary: '#6366f1',
      accent: '#818cf8', background: '#0f172a', surface: '#1e293b',
      text: '#f1f5f9', textSecondary: '#94a3b8', border: '#334155',
      success: '#34d399', warning: '#fbbf24', danger: '#f87171',
    },
    fonts: {sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace'},
    radius: 'lg',
  },
  {
    name: 'Rose Garden',
    mode: 'light',
    colors: {
      primary: '#e11d48', primaryHover: '#be123c', secondary: '#db2777',
      accent: '#f472b6', background: '#fff1f2', surface: '#ffe4e6',
      text: '#1c1917', textSecondary: '#78716c', border: '#fecdd3',
      success: '#16a34a', warning: '#d97706', danger: '#dc2626',
    },
    fonts: {sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace'},
    radius: 'xl',
  },
  {
    name: 'Forest',
    mode: 'dark',
    colors: {
      primary: '#22c55e', primaryHover: '#4ade80', secondary: '#14b8a6',
      accent: '#a3e635', background: '#052e16', surface: '#14532d',
      text: '#ecfdf5', textSecondary: '#86efac', border: '#166534',
      success: '#4ade80', warning: '#facc15', danger: '#f87171',
    },
    fonts: {sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace'},
    radius: 'md',
  },
  {
    name: 'Sunset',
    mode: 'dark',
    colors: {
      primary: '#f97316', primaryHover: '#fb923c', secondary: '#ef4444',
      accent: '#eab308', background: '#1c1917', surface: '#292524',
      text: '#fafaf9', textSecondary: '#a8a29e', border: '#44403c',
      success: '#4ade80', warning: '#fbbf24', danger: '#f87171',
    },
    fonts: {sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace'},
    radius: 'lg',
  },
  {
    name: 'Dracula',
    mode: 'dark',
    colors: {
      primary: '#bd93f9', primaryHover: '#caa9fa', secondary: '#ff79c6',
      accent: '#50fa7b', background: '#282a36', surface: '#44475a',
      text: '#f8f8f2', textSecondary: '#6272a4', border: '#6272a4',
      success: '#50fa7b', warning: '#f1fa8c', danger: '#ff5555',
    },
    fonts: {sans: 'Inter, system-ui, sans-serif', mono: 'JetBrains Mono, monospace'},
    radius: 'md',
  },
];

// ── CSS Variable Mapping ──

function applyTheme(config: ThemeConfig) {
  const root = document.documentElement;

  // Set CSS custom properties
  root.style.setProperty('--color-primary', config.colors.primary);
  root.style.setProperty('--color-primary-hover', config.colors.primaryHover);
  root.style.setProperty('--color-secondary', config.colors.secondary);
  root.style.setProperty('--color-accent', config.colors.accent);
  root.style.setProperty('--color-bg', config.colors.background);
  root.style.setProperty('--color-surface', config.colors.surface);
  root.style.setProperty('--color-text', config.colors.text);
  root.style.setProperty('--color-text-secondary', config.colors.textSecondary);
  root.style.setProperty('--color-border', config.colors.border);
  root.style.setProperty('--color-success', config.colors.success);
  root.style.setProperty('--color-warning', config.colors.warning);
  root.style.setProperty('--color-danger', config.colors.danger);
  root.style.setProperty('--font-sans', config.fonts.sans);
  root.style.setProperty('--font-mono', config.fonts.mono);

  // Radius
  const radiusMap = {none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem', full: '9999px'};
  root.style.setProperty('--radius', radiusMap[config.radius]);

  // Dark mode class
  if (config.mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Persist
  localStorage.setItem('anvil-theme', JSON.stringify(config));
}

function loadTheme(): ThemeConfig | null {
  try {
    const stored = localStorage.getItem('anvil-theme');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// ── Hook ──

export function useThemeEditor() {
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(() =>
    loadTheme() ?? THEME_PRESETS[0]
  );

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const setTheme = useCallback((theme: ThemeConfig) => {
    setCurrentTheme(theme);
  }, []);

  const updateColor = useCallback((key: keyof ThemeConfig['colors'], value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      colors: {...prev.colors, [key]: value},
    }));
  }, []);

  const resetTheme = useCallback(() => {
    setCurrentTheme(THEME_PRESETS[0]);
  }, []);

  return {
    currentTheme,
    setTheme,
    updateColor,
    resetTheme,
    presets: THEME_PRESETS,
  };
}

// ── Live Theme Editor Component ──

export function ThemeEditor({
  open,
  onClose,
  currentTheme,
  onThemeChange,
  onUpdateColor,
  presets,
}: {
  open: boolean;
  onClose: () => void;
  currentTheme: ThemeConfig;
  onThemeChange: (theme: ThemeConfig) => void;
  onUpdateColor: (key: keyof ThemeConfig['colors'], value: string) => void;
  presets: ThemeConfig[];
}) {
  if (!open) return null;

  const colorEntries: {key: keyof ThemeConfig['colors']; label: string}[] = [
    {key: 'primary', label: 'Primary'},
    {key: 'primaryHover', label: 'Primary Hover'},
    {key: 'secondary', label: 'Secondary'},
    {key: 'accent', label: 'Accent'},
    {key: 'background', label: 'Background'},
    {key: 'surface', label: 'Surface'},
    {key: 'text', label: 'Text'},
    {key: 'textSecondary', label: 'Text Secondary'},
    {key: 'border', label: 'Border'},
    {key: 'success', label: 'Success'},
    {key: 'warning', label: 'Warning'},
    {key: 'danger', label: 'Danger'},
  ];

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">🎨 Theme Editor</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Presets */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Presets</h4>
          <div className="grid grid-cols-3 gap-2">
            {presets.map(preset => (
              <button
                key={preset.name}
                onClick={() => onThemeChange(preset)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  currentTheme.name === preset.name
                    ? 'border-blue-500 ring-2 ring-blue-200'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex gap-0.5 mb-1">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: preset.colors.primary}} />
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: preset.colors.background}} />
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: preset.colors.accent}} />
                </div>
                <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">{preset.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Colors</h4>
          <div className="space-y-2">
            {colorEntries.map(({key, label}) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={currentTheme.colors[key]}
                  onChange={e => onUpdateColor(key, e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">{label}</span>
                <code className="text-[10px] text-gray-400">{currentTheme.colors[key]}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Preview</h4>
          <div
            className="rounded-lg p-4 space-y-2"
            style={{backgroundColor: currentTheme.colors.surface, borderColor: currentTheme.colors.border, borderWidth: '1px'}}
          >
            <div style={{color: currentTheme.colors.text}} className="text-sm font-medium">Sample Text</div>
            <div style={{color: currentTheme.colors.textSecondary}} className="text-xs">Secondary text sample</div>
            <div className="flex gap-2 mt-2">
              <span
                className="text-xs px-2 py-1 rounded"
                style={{backgroundColor: currentTheme.colors.primary, color: '#fff'}}
              >
                Primary
              </span>
              <span
                className="text-xs px-2 py-1 rounded"
                style={{backgroundColor: currentTheme.colors.success, color: '#fff'}}
              >
                Success
              </span>
              <span
                className="text-xs px-2 py-1 rounded"
                style={{backgroundColor: currentTheme.colors.danger, color: '#fff'}}
              >
                Danger
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
