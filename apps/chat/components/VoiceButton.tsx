/**
 * VoiceButton — push-to-talk mic button with audio level visualization.
 *
 * Features:
 * - Animated waveform ring during recording
 * - Push-to-talk (mousedown/mouseup) and click-to-toggle
 * - Audio level indicator ring
 * - Processing state spinner
 * - Error state with tooltip
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@anvil/ui';

interface VoiceButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  audioLevel: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

export default function VoiceButton({
  isRecording,
  isProcessing,
  audioLevel,
  error,
  onStart,
  onStop,
  className,
}: VoiceButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-show error tooltip for 3 seconds
  useEffect(() => {
    if (error) {
      setShowTooltip(true);
      const t = setTimeout(() => setShowTooltip(false), 3000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleClick = useCallback(() => {
    if (isRecording) {
      onStop();
    } else if (!isProcessing) {
      onStart();
    }
  }, [isRecording, isProcessing, onStart, onStop]);

  const size = 40;
  const ringWidth = 3;
  const radius = (size - ringWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Audio level mapped to stroke-dashoffset
  const levelOffset = circumference * (1 - Math.min(audioLevel * 2.5, 1));

  return (
    <div className={cn('relative', className)}>
      {/* Tooltip */}
      {showTooltip && error && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-red-500 text-white text-[10px] whitespace-nowrap z-10 animate-fade-in">
          {error}
        </div>
      )}

      {/* Outer glow ring when recording */}
      {isRecording && (
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle, rgba(239,68,68,0.2) 0%, transparent 70%)`,
            transform: 'scale(1.5)',
          }}
        />
      )}

      <button
        onClick={handleClick}
        disabled={isProcessing}
        className={cn(
          'relative flex items-center justify-center rounded-full transition-all duration-200',
          isRecording
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110'
            : isProcessing
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 animate-pulse'
              : error
                ? 'bg-red-100 dark:bg-red-950 text-red-500 hover:bg-red-200 dark:hover:bg-red-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300',
        )}
        style={{ width: size, height: size }}
        title={isRecording ? 'Release to stop' : isProcessing ? 'Processing...' : 'Click to record'}
      >
        {/* Audio level ring */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
        >
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isRecording ? 'rgba(255,255,255,0.2)' : 'transparent'}
            strokeWidth={ringWidth}
          />
          {/* Level ring */}
          {isRecording && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.8)"
              strokeWidth={ringWidth}
              strokeDasharray={circumference}
              strokeDashoffset={levelOffset}
              strokeLinecap="round"
              className="transition-all duration-75"
            />
          )}
        </svg>

        {/* Icon */}
        {isProcessing ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : isRecording ? (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      {/* Recording pulse dots */}
      {isRecording && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-red-500 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
