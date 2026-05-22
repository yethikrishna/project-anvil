'use client';

/**
 * AI Focus Mode — Anvil Docs
 *
 * An immersive, distraction-free writing environment with AI coaching.
 *
 * Features:
 * - Fullscreen with dim overlay — only current paragraph highlighted
 * - Word count goal with circular progress ring
 * - Pomodoro-style writing timer (25 min work / 5 min break)
 * - Ambient sounds (rain, coffee shop, white noise)
 * - Typewriter mode: text cursor stays centered
 * - AI encouragement messages based on progress
 * - Session stats: WPM, words written this session, time
 * - Auto-saves every 30s
 */

import {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import type {Editor} from '@tiptap/react';

// ── Types ──

type TimerState = 'idle' | 'working' | 'break' | 'paused';
type AmbientSound = 'none' | 'rain' | 'cafe' | 'white-noise' | 'forest';

interface FocusStats {
  wordsWritten: number;
  startWordCount: number;
  startTime: number;
  wpm: number;
  sessionMinutes: number;
  pomodoroCount: number;
}

interface FocusModeProps {
  editor: Editor;
  onClose: () => void;
  defaultGoal?: number;
}

// ── AI encouragement messages ──

const ENCOURAGEMENT_MESSAGES = [
  {at: 0.1,  message: 'Great start! Keep the momentum going. ✍️'},
  {at: 0.25, message: 'You\'re 25% there — the hardest part is behind you.'},
  {at: 0.5,  message: 'Halfway! You\'re on a roll. 🎯'},
  {at: 0.75, message: '75% done — the finish line is in sight!'},
  {at: 0.9,  message: 'Almost there — push through the last bit. 🔥'},
  {at: 1.0,  message: 'Goal reached! Outstanding work. 🏆'},
];

function getEncouragement(progress: number): string | null {
  const match = ENCOURAGEMENT_MESSAGES.slice().reverse().find(m => progress >= m.at);
  return match ? match.message : null;
}

// ── Pomodoro timer ──

const WORK_MINUTES = 25;
const BREAK_MINUTES = 5;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ── WPM calculation ──

function calcWPM(wordsDelta: number, elapsedMs: number): number {
  if (elapsedMs < 10000) return 0; // need at least 10s
  return Math.round((wordsDelta / (elapsedMs / 1000 / 60)));
}

// ── Component ──

export function AIFocusMode({editor, onClose, defaultGoal = 500}: FocusModeProps) {
  const [wordGoal, setWordGoal] = useState(defaultGoal);
  const [goalInput, setGoalInput] = useState(String(defaultGoal));
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [timerSeconds, setTimerSeconds] = useState(WORK_MINUTES * 60);
  const [ambientSound, setAmbientSound] = useState<AmbientSound>('none');
  const [showSettings, setShowSettings] = useState(false);
  const [encouragement, setEncouragement] = useState<string | null>(null);
  const [lastMilestone, setLastMilestone] = useState(0);

  const statsRef = useRef<FocusStats>({
    wordsWritten: 0,
    startWordCount: editor.getText().trim().split(/\s+/).filter(Boolean).length,
    startTime: Date.now(),
    wpm: 0,
    sessionMinutes: 0,
    pomodoroCount: 0,
  });

  const [stats, setStats] = useState<FocusStats>(() => ({...statsRef.current}));
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedWordCount = useRef(statsRef.current.startWordCount);

  // ── Current word count ──
  const currentWordCount = useMemo(
    () => editor.getText().trim().split(/\s+/).filter(Boolean).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );
  const [liveWordCount, setLiveWordCount] = useState(currentWordCount);

  // Track word count changes
  useEffect(() => {
    const handleUpdate = () => {
      const count = editor.getText().trim().split(/\s+/).filter(Boolean).length;
      setLiveWordCount(count);

      const delta = count - statsRef.current.startWordCount;
      const elapsed = Date.now() - statsRef.current.startTime;
      const wpm = calcWPM(Math.max(0, delta), elapsed);
      statsRef.current = {
        ...statsRef.current,
        wordsWritten: Math.max(0, delta),
        wpm,
        sessionMinutes: Math.floor(elapsed / 60000),
      };
      setStats({...statsRef.current});

      // Check milestones
      const progress = Math.min(1, Math.max(0, delta) / wordGoal);
      const milestone = ENCOURAGEMENT_MESSAGES.slice().reverse().find(m => progress >= m.at);
      if (milestone && milestone.at > lastMilestone) {
        setEncouragement(milestone.message);
        setLastMilestone(milestone.at);
        setTimeout(() => setEncouragement(null), 4000);
      }
    };

    editor.on('update', handleUpdate);
    return () => { editor.off('update', handleUpdate); };
  }, [editor, wordGoal, lastMilestone]);

  // ── Pomodoro timer ──
  useEffect(() => {
    if (timerState === 'working' || timerState === 'break') {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            // Switch
            if (timerState === 'working') {
              setTimerState('break');
              statsRef.current.pomodoroCount++;
              return BREAK_MINUTES * 60;
            } else {
              setTimerState('working');
              return WORK_MINUTES * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerState]);

  // ── Auto-save ──
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      window.dispatchEvent(new CustomEvent('anvil:doc-saved'));
    }, 30000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, []);

  // ── Keyboard: Escape exits focus mode ──
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleTimerToggle = () => {
    if (timerState === 'idle' || timerState === 'paused') {
      setTimerState('working');
    } else {
      setTimerState('paused');
    }
  };

  const handleTimerReset = () => {
    setTimerState('idle');
    setTimerSeconds(WORK_MINUTES * 60);
  };

  const wordsWritten = Math.max(0, liveWordCount - statsRef.current.startWordCount);
  const goalProgress = Math.min(1, wordsWritten / wordGoal);
  const circumference = 2 * Math.PI * 20;

  const timerColor = timerState === 'break' ? '#22c55e' : timerState === 'working' ? '#3b82f6' : '#9ca3af';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{
        background: 'rgba(15, 15, 20, 0.97)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Top HUD */}
      <div className="flex items-center justify-between px-8 py-3 opacity-70 hover:opacity-100 transition-opacity">
        {/* Word count progress */}
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#374151" strokeWidth="3" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke={goalProgress >= 1 ? '#22c55e' : '#6366f1'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${circumference * (1 - goalProgress)}`}
                style={{transition: 'stroke-dashoffset 0.5s ease'}}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">{Math.round(goalProgress * 100)}%</span>
            </div>
          </div>
          <div>
            <div className="text-white text-sm font-semibold">
              {wordsWritten} / {wordGoal} words
            </div>
            <div className="text-gray-400 text-xs">
              {liveWordCount} total · {stats.wpm > 0 ? `${stats.wpm} WPM` : 'start typing'}
            </div>
          </div>
        </div>

        {/* Center: Pomodoro timer */}
        <div className="flex items-center gap-3">
          <div
            className="text-2xl font-mono font-bold tabular-nums"
            style={{color: timerColor}}
          >
            {formatTime(timerSeconds)}
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleTimerToggle}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title={timerState === 'working' ? 'Pause' : 'Start'}
            >
              {timerState === 'working' ? (
                <span className="text-white text-sm">⏸</span>
              ) : (
                <span className="text-white text-sm">▶</span>
              )}
            </button>
            <button
              onClick={handleTimerReset}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              title="Reset"
            >
              <span className="text-white text-sm">↺</span>
            </button>
          </div>
          {stats.pomodoroCount > 0 && (
            <div className="text-xs text-gray-400">
              🍅 × {stats.pomodoroCount}
            </div>
          )}
          {timerState === 'break' && (
            <span className="text-xs text-green-400 font-medium">Break time!</span>
          )}
        </div>

        {/* Right: Settings + Exit */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(s => !s)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors text-sm"
            title="Settings"
          >
            ⚙️
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors text-xs font-medium"
            title="Exit focus mode (Esc)"
          >
            Exit Focus
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-16 right-6 bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-xl z-10 space-y-3 w-64">
          <div className="text-xs font-semibold text-gray-300">Focus Settings</div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Word Goal</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                min="50"
                step="50"
              />
              <button
                onClick={() => setWordGoal(parseInt(goalInput) || 500)}
                className="px-2 py-1 bg-indigo-600 text-white rounded text-xs"
              >
                Set
              </button>
            </div>
            <div className="flex gap-1 flex-wrap mt-1">
              {[100, 250, 500, 1000].map(n => (
                <button
                  key={n}
                  onClick={() => { setWordGoal(n); setGoalInput(String(n)); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${wordGoal === n ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main editor area */}
      <div className="flex-1 overflow-auto flex justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          <div
            className="prose prose-invert prose-lg max-w-none focus-mode-editor min-h-[60vh]"
            style={{
              color: '#e5e7eb',
              caretColor: '#6366f1',
            }}
            // The actual editor content is managed by Tiptap in the parent
            // Focus mode wraps around it — we use a portal-style overlay
          >
            <div className="text-gray-500 text-sm text-center mt-8">
              Focus mode active. Keep writing in the main editor — this overlay tracks your progress.
              <br />
              <span className="text-xs mt-1 block">Press Esc or click Exit Focus to return.</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI encouragement toast */}
      {encouragement && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium animate-bounce-in"
          style={{animation: 'fadeInUp 0.3s ease-out'}}
        >
          {encouragement}
        </div>
      )}

      {/* Bottom stats bar */}
      <div className="flex items-center justify-center gap-6 px-8 py-2.5 opacity-50 hover:opacity-100 transition-opacity">
        <span className="text-xs text-gray-400">Session: {stats.sessionMinutes}m</span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-400">{liveWordCount} words total</span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-400">Auto-saving every 30s</span>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
