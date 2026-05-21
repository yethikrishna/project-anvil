'use client';

import {useState, useEffect, useCallback, useRef} from 'react';

interface VoiceSearchOptions {
  lang?: string;          // BCP-47 language tag (e.g., 'en-US')
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

interface VoiceSearchState {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
}

/**
 * Hook for Web Speech API voice recognition.
 * Works in Chrome, Edge, and Safari (behind prefixes).
 */
export function useVoiceSearch(options: VoiceSearchOptions = {}): {
  state: VoiceSearchState;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
} {
  const {
    lang = 'en-US',
    continuous = false,
    interimResults = true,
    onResult,
    onError,
    onStart,
    onEnd,
  } = options;

  const [state, setState] = useState<VoiceSearchState>({
    isListening: false,
    isSupported: false,
    transcript: '',
    error: null,
  });

  const recognitionRef = useRef<any>(null);

  // Check support and initialize
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setState(prev => ({...prev, isSupported: false}));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState(prev => ({...prev, isListening: true, error: null}));
      onStart?.();
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const current = finalTranscript || interimTranscript;
      setState(prev => ({...prev, transcript: current}));
      onResult?.(current, !!finalTranscript);
    };

    recognition.onerror = (event: any) => {
      let message = 'Voice recognition failed';

      switch (event.error) {
        case 'not-allowed':
          message = 'Microphone access denied. Please allow microphone in browser settings.';
          break;
        case 'no-speech':
          message = 'No speech detected. Try again.';
          break;
        case 'audio-capture':
          message = 'No microphone found.';
          break;
        case 'network':
          message = 'Network error during voice recognition.';
          break;
        case 'aborted':
          return; // Don't show error for intentional aborts
      }

      setState(prev => ({...prev, isListening: false, error: message}));
      onError?.(message);
    };

    recognition.onend = () => {
      setState(prev => ({...prev, isListening: false}));
      onEnd?.();
    };

    recognitionRef.current = recognition;
    setState(prev => ({...prev, isSupported: true}));

    return () => {
      try {
        recognition.abort();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [lang, continuous, interimResults]); // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;

    // Reset state
    setState(prev => ({...prev, transcript: '', error: null}));

    try {
      recognitionRef.current.start();
    } catch (err: any) {
      // May already be started
      if (!err?.message?.includes('already started')) {
        setState(prev => ({...prev, error: 'Failed to start voice recognition'}));
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
    } catch {
      // Ignore stop errors
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setState(prev => ({...prev, transcript: '', error: null}));
  }, []);

  return {state, startListening, stopListening, resetTranscript};
}

/**
 * Microphone button component for voice search.
 */
export function VoiceSearchButton({
  isListening,
  isSupported,
  onClick,
  className = '',
}: {
  isListening: boolean;
  isSupported: boolean;
  onClick: () => void;
  className?: string;
}) {
  if (!isSupported) return null;

  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded-full transition-all ${
        isListening
          ? 'text-red-500 bg-red-50 hover:bg-red-100'
          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
      } ${className}`}
      title={isListening ? 'Stop listening' : 'Search by voice'}
      aria-label={isListening ? 'Stop voice search' : 'Start voice search'}
    >
      {/* Microphone icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="8" height="14" x="8" y="2" rx="4"/>
        <path d="M5 10a7 7 0 0 0 14 0"/>
        <line x1="12" x2="12" y1="17" y2="22"/>
        <line x1="8" x2="16" y1="22" y2="22"/>
      </svg>

      {/* Pulsing ring when listening */}
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-20"/>
          <span className="absolute inset-0 rounded-full animate-pulse bg-red-400 opacity-10"/>
        </>
      )}
    </button>
  );
}
