/**
 * POST /api/email-coach — Review an email draft before sending.
 *
 * Analyzes a draft email for:
 * - Tone (too aggressive, too passive, unclear)
 * - Clarity (confusing sentences, missing info)
 * - Completeness (is the ask clear? subject line good?)
 * - Professional impact (would this land well?)
 * - Suggestions for improvement
 * - Revised version if requested
 *
 * Returns structured feedback + optional rewrite.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ChatEngine } from '@/lib/chat-engine';

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface CoachFeedback {
  score: number; // 0-100 overall quality
  tone: {
    label: string; // e.g. "Professional", "Too casual", "Aggressive"
    issues: string[];
  };
  clarity: {
    score: number;
    issues: string[];
  };
  completeness: {
    score: number;
    issues: string[];
  };
  subjectLine: {
    rating: 'good' | 'ok' | 'weak';
    suggestion?: string;
  };
  highlights: string[]; // Things done well
  improvements: Array<{
    severity: 'critical' | 'suggestion' | 'minor';
    text: string;
    fix?: string;
  }>;
  revisedDraft?: string; // Optional full rewrite
  sendSignal: 'send-it' | 'review-first' | 'hold';
  sendSignalReason: string;
}

export async function POST(req: NextRequest) {
  const { subject, body, to, context: emailContext, tone, includeRewrite } = await req.json() as {
    subject: string;
    body: string;
    to?: string;
    context?: string; // Additional context about recipient or situation
    tone?: string; // Desired tone override
    includeRewrite?: boolean;
  };

  if (!body) {
    return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
  }

  const engine = new ChatEngine({
    aiEndpoint: process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL ?? 'gpt-4o',
  });

  const desiredTone = tone ?? 'professional';
  const maxBodyLength = 3000;
  const trimmedBody = body.length > maxBodyLength ? body.slice(0, maxBodyLength) + '...[truncated]' : body;

  const prompt = `You are an expert email writing coach. Review this email draft and provide detailed feedback.

SUBJECT: ${subject || '(no subject)'}
TO: ${to || '(unknown recipient)'}
${emailContext ? `CONTEXT: ${emailContext}` : ''}
DESIRED TONE: ${desiredTone}

EMAIL BODY:
---
${trimmedBody}
---

Analyze the email across these dimensions:
1. Tone — does it match ${desiredTone}? Any problematic phrasing?
2. Clarity — is the message clear? Is the ask/CTA obvious?
3. Completeness — is anything important missing? Is the subject line effective?
4. Professional impact — would this reflect well on the sender?
5. Specific improvements — line-level suggestions

Return ONLY valid JSON (no markdown fences) matching exactly:
{
  "score": <0-100>,
  "tone": {
    "label": "<Professional|Too Casual|Too Formal|Aggressive|Passive|Unclear>",
    "issues": ["<specific issue>", ...]
  },
  "clarity": {
    "score": <0-100>,
    "issues": ["<specific issue>", ...]
  },
  "completeness": {
    "score": <0-100>,
    "issues": ["<specific issue>", ...]
  },
  "subjectLine": {
    "rating": "<good|ok|weak>",
    "suggestion": "<better subject line if rating is not good>"
  },
  "highlights": ["<what's done well>", ...],
  "improvements": [
    {
      "severity": "<critical|suggestion|minor>",
      "text": "<what to improve>",
      "fix": "<specific rewrite suggestion>"
    }
  ],
  ${includeRewrite ? '"revisedDraft": "<complete rewrite of the email body>",' : ''}
  "sendSignal": "<send-it|review-first|hold>",
  "sendSignalReason": "<one sentence on why>"
}

Be specific and actionable. Max 3 improvements, max 3 highlights.`;

  try {
    const response = await engine.quickGenerate(
      'You are a precise email writing coach. Return only valid JSON.',
      prompt,
    );

    const cleaned = response.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const feedback: CoachFeedback = JSON.parse(cleaned);

    // Validate and sanitize
    feedback.score = Math.min(100, Math.max(0, Number(feedback.score) || 70));
    feedback.clarity.score = Math.min(100, Math.max(0, Number(feedback.clarity.score) || 70));
    feedback.completeness.score = Math.min(100, Math.max(0, Number(feedback.completeness.score) || 70));

    if (!['send-it', 'review-first', 'hold'].includes(feedback.sendSignal)) {
      feedback.sendSignal = 'review-first';
    }

    return NextResponse.json(feedback);
  } catch (err) {
    // Return a minimal fallback
    const fallback: CoachFeedback = {
      score: 75,
      tone: { label: 'Professional', issues: [] },
      clarity: { score: 75, issues: [] },
      completeness: { score: 75, issues: [] },
      subjectLine: { rating: 'ok' },
      highlights: ['Email appears well-structured'],
      improvements: [],
      sendSignal: 'review-first',
      sendSignalReason: `AI review unavailable: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
    return NextResponse.json(fallback);
  }
}
