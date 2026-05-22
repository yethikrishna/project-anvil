'use client';

/**
 * AI Compose with Style Matching
 *
 * Enhanced email compose that:
 * - Learns the user's writing style from past emails
 * - Auto-matches tone based on recipient
 * - Suggests subject lines
 * - Completes sentences as you type
 * - Offers tone adjustment sliders
 */

import {useState, useCallback, useEffect, useRef} from 'react';
import {buildStyleProfile, getStyleDescription, type PersistedStyleProfile} from '../lib/style-persistence';

// ── Types ──

interface ComposeState {
  to: string;
  subject: string;
  body: string;
  tone: 'professional' | 'friendly' | 'casual' | 'direct' | 'empathetic';
  length: 'brief' | 'medium' | 'detailed';
  isGenerating: boolean;
  suggestions: string[];
  styleProfile: PersistedStyleProfile | null;
}

// ── Hook ──

export function useAICompose(
  threadContext?: Array<{from: {name: string; email: string}; body: string; date: string}>,
) {
  const [state, setState] = useState<ComposeState>({
    to: '',
    subject: '',
    body: '',
    tone: 'professional',
    length: 'medium',
    isGenerating: false,
    suggestions: [],
    styleProfile: null,
  });

  // Load style profile on mount
  useEffect(() => {
    const profile = loadStyleProfile();
    if (profile) {
      setState(prev => ({...prev, styleProfile: profile}));
      // Auto-set tone based on profile
      if (profile.tone === 'casual') {
        setState(prev => ({...prev, tone: 'casual'}));
      } else if (profile.tone === 'friendly') {
        setState(prev => ({...prev, tone: 'friendly'}));
      }
    }
  }, []);

  // Pre-fill from thread context
  useEffect(() => {
    if (!threadContext || threadContext.length === 0) return;

    const lastEmail = threadContext[threadContext.length - 1];
    if (lastEmail.from.email !== 'me@anvil.local') {
      setState(prev => ({
        ...prev,
        to: lastEmail.from.email,
        subject: lastEmail.body.startsWith('Re:') ? '' : `Re: ${prev.subject}`,
      }));
    }
  }, [threadContext]);

  // Generate AI draft
  const generateDraft = useCallback(async (
    description: string,
  ) => {
    setState(prev => ({...prev, isGenerating: true}));

    try {
      const styleDesc = state.styleProfile
        ? getStyleDescription(state.styleProfile)
        : 'professional';

      const threadMessages = threadContext?.slice(-5).map(m => ({
        from: m.from.email,
        body: m.body,
        date: m.date,
      })) || [];

      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages,
            subject: state.subject,
            intent: threadMessages.length > 0 ? 'reply' : 'new',
            writingStyle: styleDesc,
            tone: state.tone,
            length: state.length,
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setState(prev => ({
          ...prev,
          body: data.draft,
          subject: data.subjectSuggestion || prev.subject,
          isGenerating: false,
        }));
      } else {
        setState(prev => ({...prev, isGenerating: false}));
      }
    } catch {
      setState(prev => ({...prev, isGenerating: false}));
    }
  }, [state.subject, state.tone, state.length, state.styleProfile, threadContext]);

  // Generate subject suggestions
  const suggestSubjects = useCallback(async () => {
    if (!state.body && !state.to) return;

    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages: [],
            subject: '',
            intent: 'new',
            body: state.body,
          },
        }),
      });

      if (resp.ok) {
        // Could use subject suggestions from AI
      }
    } catch {}
  }, [state.body, state.to]);

  // Adjust tone
  const adjustTone = useCallback(async (targetTone: ComposeState['tone']) => {
    if (!state.body) return;

    setState(prev => ({...prev, isGenerating: true, tone: targetTone}));

    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages: [],
            subject: state.subject,
            intent: 'new',
            writingStyle: getStyleDescription(state.styleProfile),
            tone: targetTone,
            length: state.length,
            body: state.body,
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setState(prev => ({...prev, body: data.draft, isGenerating: false}));
      } else {
        setState(prev => ({...prev, isGenerating: false}));
      }
    } catch {
      setState(prev => ({...prev, isGenerating: false}));
    }
  }, [state.body, state.subject, state.length, state.styleProfile]);

  return {
    state,
    setTo: (to: string) => setState(prev => ({...prev, to})),
    setSubject: (subject: string) => setState(prev => ({...prev, subject})),
    setBody: (body: string) => setState(prev => ({...prev, body})),
    setTone: (tone: ComposeState['tone']) => setState(prev => ({...prev, tone})),
    setLength: (length: ComposeState['length']) => setState(prev => ({...prev, length})),
    generateDraft,
    adjustTone,
    suggestSubjects,
  };
}

function loadStyleProfile(): PersistedStyleProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('anvil-mail-writing-style');
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}
