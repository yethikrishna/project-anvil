/**
 * VoiceOutput — TTS playback for AI responses.
 */

'use client';

import { useState, useCallback, useRef } from 'react';

interface Props {
  text: string;
}

export default function VoiceOutput({ text }: Props) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async () => {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlaying(false); };

      setPlaying(true);
      audio.play();
    } catch {
      // TTS failed
    }
  }, [text, playing]);

  if (!text) return null;

  return (
    <button
      onClick={speak}
      className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-500 transition-colors ml-2"
      title={playing ? 'Stop playing' : 'Read aloud'}
    >
      {playing ? '🔊 Playing...' : '🔇 Read aloud'}
    </button>
  );
}
