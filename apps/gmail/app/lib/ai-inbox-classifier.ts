'use client';

/**
 * AI Inbox Classifier — LLM-backed email categorization
 *
 * Replaces the heuristic classifyInboxCategory() with real LLM calls.
 * - Batches emails for efficiency (up to 20 per request)
 * - Caches results in sessionStorage to avoid re-classifying
 * - Falls back to heuristic on API error
 * - Exposes a React hook: useInboxClassifier
 */

import {useEffect, useState, useRef, useCallback} from 'react';
import type {MailMessage} from './ai-mail';
import {classifyInboxCategory, type InboxCategory, type CategorizedInbox} from './ai-mail';

// ── Types ──

export interface AIClassification {
  emailId: string;
  category: InboxCategory;
  confidence: number;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

const CACHE_KEY = 'anvil-mail-ai-classifications';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

interface CacheEntry {
  classifications: AIClassification[];
  ts: number;
}

function loadCache(): Map<string, AIClassification> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const parsed: CacheEntry = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return new Map();
    }
    return new Map(parsed.classifications.map(c => [c.emailId, c]));
  } catch {
    return new Map();
  }
}

function saveCache(map: Map<string, AIClassification>) {
  try {
    const classifications = Array.from(map.values());
    const entry: CacheEntry = {classifications, ts: Date.now()};
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — ignore
  }
}

// ── Server-side LLM classify (batch) ──

async function classifyBatch(
  emails: Array<{id: string; subject: string; from: string; body: string}>,
): Promise<AIClassification[]> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      action: 'classify',
      payload: {
        emails: emails.map(e => ({subject: e.subject, from: e.from, body: e.body})),
      },
    }),
  });

  if (!resp.ok) throw new Error(`Classify API ${resp.status}`);
  const results: Array<{category: string; confidence: number; reasoning: string; priority: string}> = await resp.json();

  return emails.map((email, i) => {
    const r = results[i] ?? {category: 'primary', confidence: 0.5, reasoning: '', priority: 'medium'};
    return {
      emailId: email.id,
      category: r.category as InboxCategory,
      confidence: r.confidence,
      reasoning: r.reasoning,
      priority: r.priority as AIClassification['priority'],
    };
  });
}

// ── Hook ──

export interface UseInboxClassifierResult {
  classifications: Map<string, AIClassification>;
  isClassifying: boolean;
  reclassify: () => void;
  getCategory: (email: MailMessage) => InboxCategory;
  getPriority: (emailId: string) => AIClassification['priority'];
}

/**
 * useInboxClassifier
 *
 * Classifies all inbox emails via LLM on mount and when the email list changes.
 * Falls back to heuristic classification if the API is unavailable.
 */
export function useInboxClassifier(emails: MailMessage[]): UseInboxClassifierResult {
  const [classifications, setClassifications] = useState<Map<string, AIClassification>>(loadCache);
  const [isClassifying, setIsClassifying] = useState(false);
  const classifyingRef = useRef(false);
  const emailIdsRef = useRef<string>('');

  const classify = useCallback(async (force = false) => {
    if (classifyingRef.current) return;

    const inboxEmails = emails.filter(e => e.labels.includes('INBOX'));
    if (inboxEmails.length === 0) return;

    const currentIds = inboxEmails.map(e => e.id).join(',');
    if (!force && currentIds === emailIdsRef.current) return;
    emailIdsRef.current = currentIds;

    // Find emails not yet classified
    const toClassify = inboxEmails.filter(e => force || !classifications.has(e.id));
    if (toClassify.length === 0) return;

    classifyingRef.current = true;
    setIsClassifying(true);

    try {
      const BATCH_SIZE = 20;
      const newMap = new Map(classifications);

      for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
        const batch = toClassify.slice(i, i + BATCH_SIZE);
        const batchInput = batch.map(e => ({
          id: e.id,
          subject: e.subject,
          from: e.from.email,
          body: e.body.slice(0, 400),
        }));

        try {
          const results = await classifyBatch(batchInput);
          for (const r of results) {
            newMap.set(r.emailId, r);
          }
        } catch {
          // Heuristic fallback for this batch
          for (const e of batch) {
            const heuristic = classifyInboxCategory({
              subject: e.subject,
              from: e.from.email,
              body: e.body,
            });
            newMap.set(e.id, {
              emailId: e.id,
              category: heuristic.category,
              confidence: heuristic.confidence,
              reasoning: heuristic.reasoning ?? 'heuristic fallback',
              priority: 'medium',
            });
          }
        }

        setClassifications(new Map(newMap));
        saveCache(newMap);
      }
    } finally {
      classifyingRef.current = false;
      setIsClassifying(false);
    }
  }, [emails, classifications]);

  // Classify on mount and when emails change
  useEffect(() => {
    classify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.length]);

  const reclassify = useCallback(() => {
    sessionStorage.removeItem(CACHE_KEY);
    setClassifications(new Map());
    emailIdsRef.current = '';
    classify(true);
  }, [classify]);

  const getCategory = useCallback(
    (email: MailMessage): InboxCategory => {
      const cached = classifications.get(email.id);
      if (cached) return cached.category;
      // Sync heuristic while async LLM result loads
      return classifyInboxCategory({
        subject: email.subject,
        from: email.from.email,
        body: email.body,
      }).category;
    },
    [classifications],
  );

  const getPriority = useCallback(
    (emailId: string): AIClassification['priority'] => {
      return classifications.get(emailId)?.priority ?? 'medium';
    },
    [classifications],
  );

  return {classifications, isClassifying, reclassify, getCategory, getPriority};
}
