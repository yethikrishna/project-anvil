/**
 * Enhanced Voice Input with local Whisper fallback.
 *
 * Recording flow:
 * 1. User holds mic button → MediaRecorder captures audio
 * 2. On release, audio blob sent to /api/voice/stt
 * 3. Server tries local Whisper first, falls back to OpenAI API
 * 4. Transcribed text returned to input field
 *
 * Features:
 * - Audio level visualization
 * - Push-to-talk with hold gesture
 * - Silence detection auto-stop
 * - Language auto-detection
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@anvil/ui';

interface UseVoiceInputOptions {
  onTranscript: (text: string) => void;
  language?: string;
  silenceTimeoutMs?: number;
}

interface UseVoiceInputReturn {
  isRecording: boolean;
  isProcessing: boolean;
  audioLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  error: string | null;
}

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio level visualization
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate RMS level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const normalized = Math.min(rms / 128, 1);

    setAudioLevel(normalized);

    // Silence detection
    if (normalized < 0.02 && isRecording) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          stopRecording();
        }, options.silenceTimeoutMs ?? 3000);
      }
    } else if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, [isRecording, options.silenceTimeoutMs]);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Set up audio analyser for level visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      audioContextRef.current = audioContext;

      // Determine best supported codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Cleanup audio context
        audioContextRef.current?.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        cancelAnimationFrame(animationFrameRef.current);
        setAudioLevel(0);

        // Release mic
        stream.getTracks().forEach(t => t.stop());

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        // Process audio
        if (chunksRef.current.length === 0) return;

        setIsProcessing(true);
        const blob = new Blob(chunksRef.current, { type: mimeType });

        try {
          const formData = new FormData();
          formData.append('audio', blob, `recording.${mimeType.includes('webm') ? 'webm' : 'mp4'}`);
          if (options.language) formData.append('language', options.language);

          const res = await fetch('/api/voice/stt', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          if (data.text) {
            options.onTranscript(data.text);
          } else if (data.error) {
            setError(data.error);
          }
        } catch (err) {
          setError('Speech recognition failed');
        } finally {
          setIsProcessing(false);
          chunksRef.current = [];
        }
      };

      recorder.start(100); // 100ms chunks for better silence detection
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Start audio level monitoring
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    } catch (err) {
      setError('Microphone access denied');
    }
  }, [options, updateAudioLevel]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      audioContextRef.current?.close();
      cancelAnimationFrame(animationFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  return {
    isRecording,
    isProcessing,
    audioLevel,
    startRecording,
    stopRecording,
    error,
  };
}

// ── Voice Button Component ──

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceButton({ onTranscript, disabled, className }: VoiceButtonProps) {
  const { isRecording, isProcessing, audioLevel, startRecording, stopRecording, error } =
    useVoiceInput({ onTranscript });

  return (
    <div className="relative">
      <button
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={() => isRecording && stopRecording()}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        disabled={disabled || isProcessing}
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all relative',
          isRecording
            ? 'bg-red-500 text-white voice-pulse'
            : isProcessing
              ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 animate-pulse'
              : disabled
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          className,
        )}
        title={
          error ? error :
          isRecording ? 'Release to stop' :
          isProcessing ? 'Processing...' :
          'Hold to record voice'
        }
      >
        {isProcessing ? '⏳' : '🎤'}
      </button>

      {/* Audio level indicator */}
      {isRecording && (
        <div className="absolute -top-1 -right-1 w-3 h-3">
          <svg viewBox="0 0 12 12" className="w-full h-full">
            <circle
              cx="6" cy="6" r={3 + audioLevel * 3}
              fill="rgba(239, 68, 68, 0.6)"
              className="transition-all duration-75"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
