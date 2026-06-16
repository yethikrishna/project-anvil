/**
 * VoiceOutput — TTS playback for AI responses.
 *
 * Features:
 * - On-demand playback with visual feedback
 * - Speed control (0.75x - 2.0x)
 * - Audio waveform visualization
 * - Auto-play option
 * - Smart truncation for long messages
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';
import AudioVisualizer from './AudioVisualizer';

interface Props {
  text: string;
  autoPlay?: boolean;
  compact?: boolean;
}

const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

export default function VoiceOutput({ text, autoPlay = false, compact = true }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    setPlaying(false);
    setProgress(0);
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  }, []);

  const speak = useCallback(async () => {
    if (playing) {
      stopPlayback();
      return;
    }

    if (!text || text.length < 10) return;

    setLoading(true);
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 4000),
          speed,
          format: 'mp3',
        }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onloadedmetadata = () => {
        setLoading(false);
        setPlaying(true);
        audio.play();

        // Track progress
        progressInterval.current = setInterval(() => {
          if (audio.duration && audio.currentTime) {
            setProgress(audio.currentTime / audio.duration);
          }
        }, 100);
      };

      audio.onended = () => {
        stopPlayback();
      };

      audio.onerror = () => {
        stopPlayback();
      };
    } catch {
      setLoading(false);
    }
  }, [text, playing, speed, stopPlayback]);

  // Auto-play when text changes
  useEffect(() => {
    if (autoPlay && text && text.length >= 10 && !playing && !loading) {
      const timer = setTimeout(speak, 1500);
      return () => clearTimeout(timer);
    }
  }, [text, autoPlay, speak, playing, loading]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  if (!text || text.length < 10) return null;

  // Compact mode — inline button
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          onClick={speak}
          disabled={loading}
          className={cn(
            'text-[10px] transition-colors inline-flex items-center gap-1',
            playing
              ? 'text-blue-500 font-medium'
              : loading
                ? 'text-gray-300 animate-pulse'
                : 'text-gray-400 hover:text-blue-500',
          )}
          title={playing ? 'Stop' : 'Read aloud'}
        >
          {playing ? (
            <>
              <span className="inline-flex gap-[2px] items-end h-3">
                <span className="w-[2px] bg-blue-500 rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0ms' }} />
                <span className="w-[2px] bg-blue-500 rounded-full animate-pulse" style={{ height: '60%', animationDelay: '150ms' }} />
                <span className="w-[2px] bg-blue-500 rounded-full animate-pulse" style={{ height: '80%', animationDelay: '300ms' }} />
              </span>
              Stop
            </>
          ) : loading ? (
            '⏳'
          ) : (
            '🔊'
          )}
        </button>

        {playing && (
          <button
            onClick={() => {
              const idx = SPEEDS.indexOf(speed);
              const next = SPEEDS[(idx + 1) % SPEEDS.length];
              setSpeed(next);
              if (audioRef.current) audioRef.current.playbackRate = next;
            }}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            {speed}x
          </button>
        )}
      </span>
    );
  }

  // Full mode — with progress bar
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        onClick={speak}
        disabled={loading}
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all shrink-0',
          playing
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
            : loading
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 animate-pulse'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700',
        )}
        title={playing ? 'Stop' : 'Read aloud'}
      >
        {playing ? '⏸' : loading ? '⏳' : '▶'}
      </button>

      {playing && (
        <AudioVisualizer
          audioElement={audioRef.current ?? undefined}
          mode="bars"
          color="#3b82f6"
          width={120}
          height={28}
          barCount={24}
          active={playing}
          className="flex-1 rounded"
        />
      )}

      {!playing && (
        <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {playing && (
        <button
          onClick={() => {
            const idx = SPEEDS.indexOf(speed);
            const next = SPEEDS[(idx + 1) % SPEEDS.length];
            setSpeed(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
        >
          {speed}x
        </button>
      )}
    </div>
  );
}
