'use client';

/**
 * Accessibility utilities for Project Anvil.
 *
 * Features:
 * - Screen reader announcements via ARIA live regions
 * - Landmark navigation support
 * - Skip links
 * - Voice control interface via Web Speech API
 * - High contrast mode detection
 * - Reduced motion detection
 */

import {useState, useEffect, useCallback, useRef} from 'react';

// ── Screen Reader Announcements ──

let liveRegion: HTMLElement | null = null;

function getOrCreateLiveRegion(politeness: 'polite' | 'assertive'): HTMLElement {
  const id = `anvil-sr-${politeness}`;
  let region = document.getElementById(id);

  if (!region) {
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    document.body.appendChild(region);
  }

  return region;
}

/**
 * Announce a message to screen readers.
 */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return;
  const region = getOrCreateLiveRegion(politeness);
  region.textContent = '';
  // Force screen reader to re-announce
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

// ── Hook: Accessibility Preferences ──

export interface A11yPreferences {
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersColorScheme: 'light' | 'dark';
  screenReaderActive: boolean;
  fontSize: 'normal' | 'large' | 'extra-large';
}

export function useA11yPreferences(): A11yPreferences {
  const [prefs, setPrefs] = useState<A11yPreferences>({
    prefersReducedMotion: false,
    prefersHighContrast: false,
    prefersColorScheme: 'light',
    screenReaderActive: false,
    fontSize: 'normal',
  });

  useEffect(() => {
    const mqReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqHighContrast = window.matchMedia('(prefers-contrast: more)');
    const mqDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

    const update = () => {
      setPrefs({
        prefersReducedMotion: mqReducedMotion.matches,
        prefersHighContrast: mqHighContrast.matches,
        prefersColorScheme: mqDarkMode.matches ? 'dark' : 'light',
        screenReaderActive: false, // Can't reliably detect
        fontSize: 'normal',
      });
    };

    update();

    mqReducedMotion.addEventListener('change', update);
    mqHighContrast.addEventListener('change', update);
    mqDarkMode.addEventListener('change', update);

    return () => {
      mqReducedMotion.removeEventListener('change', update);
      mqHighContrast.removeEventListener('change', update);
      mqDarkMode.removeEventListener('change', update);
    };
  }, []);

  return prefs;
}

// ── Skip Links Component ──

export function SkipLinks({links}: {links: {label: string; target: string}[]}) {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-0 focus-within:left-0 focus-within:z-[9999] focus-within:p-4 focus-within:bg-blue-600">
      {links.map(link => (
        <a
          key={link.target}
          href={link.target}
          className="block text-white font-medium px-4 py-2 hover:bg-blue-700 rounded"
        >
          Skip to {link.label}
        </a>
      ))}
    </div>
  );
}

// ── ARIA Landmarks Helper ──

export const LANDMARKS = {
  main: {role: 'main', label: 'Main content'},
  nav: {role: 'navigation', label: 'Navigation'},
  search: {role: 'search', label: 'Search'},
  complementary: {role: 'complementary', label: 'Sidebar'},
  contentinfo: {role: 'contentinfo', label: 'Footer'},
  banner: {role: 'banner', label: 'Header'},
  form: {role: 'form', label: 'Form'},
};

// ── Voice Control ──

export interface VoiceCommand {
  command: string;
  description: string;
  handler: () => void;
}

export function useVoiceControl(commands: VoiceCommand[]) {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      setLastCommand(transcript);

      for (const cmd of commands) {
        if (transcript.includes(cmd.command.toLowerCase())) {
          cmd.handler();
          announce(`Executed: ${cmd.command}`);
          break;
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [commands, isSupported]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return {
    isListening,
    isSupported,
    lastCommand,
    startListening,
    stopListening,
    commands,
  };
}

// ── Voice Control Button Component ──

export function VoiceControlButton({voiceControl}: {voiceControl: ReturnType<typeof useVoiceControl>}) {
  if (!voiceControl.isSupported) return null;

  return (
    <div className="relative">
      <button
        onClick={voiceControl.isListening ? voiceControl.stopListening : voiceControl.startListening}
        className={`p-2 rounded-lg transition-colors ${
          voiceControl.isListening
            ? 'bg-red-100 text-red-600 animate-pulse'
            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
        title={voiceControl.isListening ? 'Listening for commands...' : 'Voice control'}
        aria-label={voiceControl.isListening ? 'Stop voice control' : 'Start voice control'}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {voiceControl.isListening && (
        <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 w-48">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-600">Listening...</span>
          </div>
          <div className="text-[10px] text-gray-400 space-y-1">
            {voiceControl.commands.slice(0, 4).map(cmd => (
              <div key={cmd.command} className="flex items-center gap-1">
                <span className="font-mono">"{cmd.command}"</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Visually Hidden ──

export function VisuallyHidden({children}: {children: React.ReactNode}) {
  return (
    <span className="sr-only">{children}</span>
  );
}
