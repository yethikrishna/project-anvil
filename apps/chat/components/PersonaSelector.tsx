/**
 * PersonaSelector — AI behavior mode switcher.
 *
 * Lets the user instantly switch between AI personalities:
 * - Executive Assistant: Concise, action-focused, calendar/email expert
 * - Deep Researcher: Thorough, source-citing, comprehensive analysis
 * - Code Mentor: Technical, precise, code-first answers
 * - Personal Coach: Supportive, strategic, helps you think through problems
 * - Creative Partner: Generative, inventive, brainstorming and ideation
 */

'use client';

import { useState } from 'react';
import { cn } from '@anvil/ui';

export interface Persona {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  description: string;
  systemSuffix: string;
  accent: string;
  shortcut: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'executive',
    name: 'Executive',
    icon: '💼',
    tagline: 'Sharp & action-focused',
    description: 'Concise answers, immediate action. Perfect for email, calendar, and quick decisions.',
    systemSuffix: `PERSONA: Executive Assistant Mode.
- Ultra-concise. 1-3 sentences max unless detail is explicitly requested.
- Lead with the action, not the explanation.
- Bullet points > paragraphs. Tables > bullets when comparing options.
- Always suggest the single best next step.
- For email tasks: draft immediately, don't describe.
- For scheduling: check availability and propose a time, don't ask.`,
    accent: 'from-slate-600 to-slate-800',
    shortcut: '1',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    icon: '🔬',
    tagline: 'Thorough & source-aware',
    description: 'Deep analysis, cited sources, structured reports. Great for research tasks and summaries.',
    systemSuffix: `PERSONA: Deep Researcher Mode.
- Provide thorough, well-structured responses.
- Always search for current information before answering factual questions.
- Structure responses: Executive Summary → Key Findings → Analysis → Sources/Next Steps.
- Surface contradictions, edge cases, and caveats.
- Use headers and tables to organize complex information.
- Cite sources and dates when available.`,
    accent: 'from-emerald-600 to-teal-700',
    shortcut: '2',
  },
  {
    id: 'coder',
    name: 'Code Mentor',
    icon: '⚡',
    tagline: 'Technical & precise',
    description: 'Code-first answers, debugging help, architecture guidance. For developers.',
    systemSuffix: `PERSONA: Code Mentor Mode.
- Lead with working code. Explain after.
- Prefer concrete examples over abstract explanations.
- Always include error handling and edge cases.
- Suggest the modern/idiomatic approach for the language.
- When debugging: identify the root cause first, then fix.
- Use technical terminology precisely. Don't simplify unnecessarily.
- For architecture questions: consider trade-offs, not just the happy path.`,
    accent: 'from-violet-600 to-purple-700',
    shortcut: '3',
  },
  {
    id: 'coach',
    name: 'Coach',
    icon: '🎯',
    tagline: 'Strategic & supportive',
    description: 'Helps you think through problems, make decisions, and plan strategically.',
    systemSuffix: `PERSONA: Strategic Coach Mode.
- Ask clarifying questions before offering solutions.
- Help the user think through trade-offs, not just get answers.
- Use frameworks and mental models when relevant (e.g., SWOT, 5 Whys, First Principles).
- Challenge assumptions gently.
- Summarize what you've heard before offering perspective.
- End with a clear next step or decision the user should make.
- Be direct about risks and downsides.`,
    accent: 'from-amber-500 to-orange-600',
    shortcut: '4',
  },
  {
    id: 'creative',
    name: 'Creative',
    icon: '✨',
    tagline: 'Inventive & generative',
    description: 'Brainstorming, writing, ideation. Gets creative and thinks outside the box.',
    systemSuffix: `PERSONA: Creative Partner Mode.
- Lead with ideas, not caveats.
- Generate multiple options or variations — quantity first, quality second.
- Think in metaphors, analogies, and unexpected angles.
- For writing tasks: draft first, refine based on feedback.
- Suggest unexpected approaches.
- Be playful when the context allows.
- For brainstorming: generate at least 5 ideas before discussing any of them.`,
    accent: 'from-pink-500 to-rose-600',
    shortcut: '5',
  },
];

const STORAGE_KEY = 'anvil-chat:persona';

export function loadPersona(): Persona {
  if (typeof window === 'undefined') return PERSONAS[0];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = PERSONAS.find(p => p.id === stored);
      if (found) return found;
    }
  } catch {}
  return PERSONAS[0];
}

export function savePersona(persona: Persona): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, persona.id);
  } catch {}
}

interface Props {
  current: Persona;
  onChange: (persona: Persona) => void;
  compact?: boolean;
}

export default function PersonaSelector({ current, onChange, compact = false }: Props) {
  const [open, setOpen] = useState(false);

  const handleSelect = (persona: Persona) => {
    onChange(persona);
    savePersona(persona);
    setOpen(false);
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium',
            'bg-gradient-to-r text-white shadow-sm transition-all hover:shadow-md',
            `bg-gradient-to-r ${current.accent}`,
          )}
          title={`Persona: ${current.name} — click to change`}
        >
          <span>{current.icon}</span>
          <span className="hidden sm:inline">{current.name}</span>
          <svg className="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-2 py-1">
                  AI Persona
                </p>
              </div>
              <div className="p-1.5 flex flex-col gap-1">
                {PERSONAS.map(persona => (
                  <button
                    key={persona.id}
                    onClick={() => handleSelect(persona)}
                    className={cn(
                      'flex items-start gap-3 p-2.5 rounded-xl text-left transition-all',
                      current.id === persona.id
                        ? 'bg-gray-100 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shrink-0 shadow-sm',
                      persona.accent,
                    )}>
                      <span className="text-sm">{persona.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {persona.name}
                        </span>
                        <span className="text-[9px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                          ⌥{persona.shortcut}
                        </span>
                        {current.id === persona.id && (
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium ml-auto">
                            active
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                        {persona.tagline}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Full panel mode
  return (
    <div className="grid grid-cols-1 gap-2">
      {PERSONAS.map(persona => (
        <button
          key={persona.id}
          onClick={() => handleSelect(persona)}
          className={cn(
            'flex items-start gap-3 p-3 rounded-xl text-left transition-all border',
            current.id === persona.id
              ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/30',
          )}
        >
          <div className={cn(
            'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shrink-0 shadow-sm',
            persona.accent,
          )}>
            <span className="text-base">{persona.icon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {persona.name}
              </span>
              <span className="text-[9px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                ⌥{persona.shortcut}
              </span>
              {current.id === persona.id && (
                <span className="ml-auto text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{persona.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
