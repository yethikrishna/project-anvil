/**
 * VoiceOutput — TTS playback for AI responses.
 * Supports streaming audio, auto-play toggle, and speed control.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface Props {
  text: string;
  autoPlay?: boolean;
}

export default function VoiceOutput({ text, autoPlay = false }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    if (!text || text.length < 10) return; // Don't TTS very short text

    setLoading(true);
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000), speed }), // Limit to 4k chars
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = speed;

      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); };

      setPlaying(true);
      setLoading(false);
      audio.play();
    } catch {
      // TTS failed silently
      setLoading(false);
    }
  }, [text, playing, speed]);

  // Auto-play when text changes (if enabled)
  useEffect(() => {
    if (autoPlay && text && !playing) {
      const timer = setTimeout(speak, 1000); // Debounce
      return () => clearTimeout(timer);
    }
  }, [text, autoPlay, speak, playing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  if (!text || text.length < 10) return null;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={speak}
        disabled={loading}
        className={cn(
          'text-[10px] transition-colors',
          playing
            ? 'text-blue-500 font-medium'
            : loading
              ? 'text-gray-300 animate-pulse'
              : 'text-gray-400 hover:text-blue-500',
        )}
        title={playing ? 'Stop playing' : 'Read aloud'}
      >
        {playing ? '🔊 Playing' : loading ? '⏳ Loading...' : '🔇 Read aloud'}
      </button>

      {/* Speed control (only when playing) */}
      {playing && (
        <button
          onClick={() => {
            const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
            const idx = speeds.indexOf(speed);
            const next = speeds[(idx + 1) % speeds.length];
            setSpeed(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          className="text-[10px] text-gray-400 hover:text-gray-600"
        >
          {speed}x
        </button>
      )}
    </span>
  );
}
