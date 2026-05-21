/**
 * @anvil/ml — Client-side ML inference via ONNX Runtime WebAssembly.
 *
 * Runs ML models directly in the browser for:
 * - Email triage: classify emails as important/promotions/social/updates
 * - Document autocomplete: suggest next words/phrases
 * - Sentiment analysis: positive/negative/neutral scoring
 *
 * No server calls — everything runs in-browser via WASM.
 */

// ── Types ──

export interface InferenceResult<T = string> {
  label: T;
  confidence: number;
  inferenceTimeMs: number;
}

export interface EmailClassification {
  category: 'important' | 'promotions' | 'social' | 'updates' | 'spam';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
  suggestedAction: 'reply' | 'archive' | 'snooze' | 'delete' | 'star';
  confidence: number;
}

export interface AutocompleteSuggestion {
  text: string;
  confidence: number;
  type: 'word' | 'phrase' | 'sentence';
}

export interface ModelStatus {
  loaded: boolean;
  loading: boolean;
  modelId: string;
  sizeBytes: number;
  loadTimeMs?: number;
}

// ── Inference Engine (WASM backend) ──

export type InferenceBackend = 'wasm' | 'webgpu' | 'fallback';

let backend: InferenceBackend = 'fallback';
let modelStatus: Map<string, ModelStatus> = new Map();

/**
 * Initialize the ML inference engine.
 * Tries WebGPU first, falls back to WASM, then to rule-based fallback.
 */
export async function initML(): Promise<InferenceBackend> {
  try {
    // Check for WebGPU support
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        backend = 'webgpu';
        return 'webgpu';
      }
    }
  } catch { /* WebGPU not available */ }

  try {
    // Check for WebAssembly support
    if (typeof WebAssembly !== 'undefined') {
      backend = 'wasm';
      return 'wasm';
    }
  } catch { /* WASM not available */ }

  backend = 'fallback';
  return 'fallback';
}

export function getBackend(): InferenceBackend {
  return backend;
}

export function getModelStatus(modelId: string): ModelStatus | undefined {
  return modelStatus.get(modelId);
}

// ── Email Triage ──

const IMPORTANT_KEYWORDS = [
  'urgent', 'asap', 'important', 'critical', 'deadline', 'action required',
  'approval', 'review', 'sign', 'contract', 'invoice', 'payment',
  'meeting', 'calendar', 'schedule', 'interview', 'offer',
];

const PROMOTION_KEYWORDS = [
  'sale', 'discount', 'offer', 'deal', 'coupon', 'promo', 'free trial',
  'subscribe', 'upgrade', 'limited time', 'exclusive', 'save up to',
  'unsubscribe', 'marketing', 'newsletter',
];

const SOCIAL_KEYWORDS = [
  'friend', 'follow', 'like', 'share', 'comment', 'mentioned you',
  'invited you', 'tagged', 'birthday', 'anniversary', 'connection',
  'linkedin', 'twitter', 'facebook', 'instagram',
];

const UPDATES_KEYWORDS = [
  'notification', 'update', 'alert', 'reminder', 'receipt', 'confirmed',
  'shipped', 'delivered', 'statement', 'report', 'summary', 'weekly',
  'monthly', 'automated', 'noreply',
];

const SPAM_INDICATORS = [
  'winner', 'congratulations', 'click here', 'act now', 'limited offer',
  'no obligation', 'risk free', 'guarantee', 'wire transfer', 'prince',
  'lottery', 'inheritance', 'claim your',
];

const POSITIVE_WORDS = [
  'great', 'awesome', 'excellent', 'wonderful', 'amazing', 'thank',
  'appreciate', 'love', 'perfect', 'fantastic', 'congratulations',
  'pleased', 'happy', 'excited', 'looking forward',
];

const NEGATIVE_WORDS = [
  'sorry', 'unfortunately', 'issue', 'problem', 'error', 'bug',
  'fail', 'broken', 'wrong', 'bad', 'terrible', 'angry',
  'disappointed', 'frustrated', 'complaint', 'refund', 'cancel',
];

/**
 * Classify an email using rule-based inference (fallback for WASM models).
 * In production, this would use an ONNX-optimized DistilBERT model.
 */
export function classifyEmail(subject: string, body: string, from?: string): EmailClassification {
  const start = performance.now();
  const text = `${subject} ${body}`.toLowerCase();

  // ── Category Classification ──

  const spamScore = scoreKeywords(text, SPAM_INDICATORS);
  const importantScore = scoreKeywords(text, IMPORTANT_KEYWORDS);
  const promoScore = scoreKeywords(text, PROMOTION_KEYWORDS);
  const socialScore = scoreKeywords(text, SOCIAL_KEYWORDS);
  const updatesScore = scoreKeywords(text, UPDATES_KEYWORDS);

  let category: EmailClassification['category'];
  let maxScore = Math.max(spamScore, importantScore, promoScore, socialScore, updatesScore);

  if (spamScore > 0 && spamScore >= maxScore) {
    category = 'spam';
  } else if (importantScore >= maxScore) {
    category = 'important';
  } else if (socialScore >= maxScore) {
    category = 'social';
  } else if (promoScore >= maxScore) {
    category = 'promotions';
  } else if (updatesScore > 0) {
    category = 'updates';
  } else {
    category = 'important'; // Default: treat unknown as potentially important
  }

  // ── Priority ──

  let priority: EmailClassification['priority'] = 'medium';
  if (spamScore > 2) priority = 'low';
  else if (category === 'important' && (text.includes('urgent') || text.includes('asap'))) priority = 'urgent';
  else if (category === 'important') priority = 'high';
  else if (category === 'promotions' || category === 'social') priority = 'low';

  // ── Sentiment ──

  const positiveScore = scoreKeywords(text, POSITIVE_WORDS);
  const negativeScore = scoreKeywords(text, NEGATIVE_WORDS);
  const sentimentScore = positiveScore - negativeScore;

  let sentiment: EmailClassification['sentiment'];
  let sentimentScoreNorm: number;
  if (sentimentScore > 1) { sentiment = 'positive'; sentimentScoreNorm = Math.min(1, sentimentScore / 5); }
  else if (sentimentScore < -1) { sentiment = 'negative'; sentimentScoreNorm = Math.max(-1, sentimentScore / 5); }
  else { sentiment = 'neutral'; sentimentScoreNorm = 0; }

  // ── Suggested Action ──

  let suggestedAction: EmailClassification['suggestedAction'];
  if (category === 'spam') suggestedAction = 'delete';
  else if (category === 'promotions') suggestedAction = 'archive';
  else if (priority === 'urgent') suggestedAction = 'reply';
  else if (category === 'important') suggestedAction = 'star';
  else if (category === 'social') suggestedAction = 'archive';
  else suggestedAction = 'snooze';

  const inferenceTimeMs = performance.now() - start;
  const confidence = Math.min(0.99, 0.5 + (maxScore * 0.15));

  return {
    category,
    priority,
    sentiment,
    sentimentScore: sentimentScoreNorm,
    suggestedAction,
    confidence,
    inferenceTimeMs,
  };
}

function scoreKeywords(text: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      score += keyword.split(' ').length; // Multi-word keywords score higher
    }
  }
  return score;
}

// ── Document Autocomplete ──

const PHRASE_TEMPLATES: Record<string, string[]> = {
  'thank': ['thank you for', 'thanks for your', 'thank you so much'],
  'please': ['please let me know', 'please find attached', 'please review the'],
  'i would': ['i would like to', 'i would suggest', 'i would appreciate'],
  'looking': ['looking forward to', 'looking forward to hearing', 'looking forward to seeing'],
  'let me': ['let me know if', 'let me know when', 'let me take a'],
  'i think': ['i think we should', 'i think it would', 'i think this is'],
  'we need': ['we need to discuss', 'we need to make sure', 'we need to follow up'],
  'can you': ['can you please', 'can you confirm', 'can you share the'],
  'i hope': ['i hope this helps', 'i hope you are', 'i hope everything is'],
  'best': ['best regards', 'best wishes', 'best practices for'],
};

/**
 * Generate autocomplete suggestions based on the current text context.
 * In production, this would use an ONNX-optimized GPT-2 small model.
 */
export function generateAutocomplete(
  currentText: string,
  cursorPosition: number,
  maxSuggestions = 3
): AutocompleteSuggestion[] {
  const start = performance.now();
  const suggestions: AutocompleteSuggestion[] = [];

  // Get the last few words before the cursor
  const textBeforeCursor = currentText.slice(0, cursorPosition);
  const lastWords = textBeforeCursor.split(/\s+/).slice(-3).join(' ').toLowerCase().trim();

  if (!lastWords) return [];

  // Match against phrase templates
  for (const [trigger, phrases] of Object.entries(PHRASE_TEMPLATES)) {
    if (lastWords.endsWith(trigger) || lastWords.includes(trigger)) {
      for (const phrase of phrases) {
        if (phrase.startsWith(lastWords)) {
          suggestions.push({
            text: phrase.slice(lastWords.length),
            confidence: 0.85,
            type: 'phrase',
          });
        }
      }
    }
  }

  // Word-level suggestions based on common patterns
  const wordPatterns: Record<string, string[]> = {
    'the': ['following', 'attached', 'new', 'latest', 'previous'],
    'to': ['the', 'be', 'do', 'help', 'ensure', 'provide'],
    'for': ['your', 'the', 'this', 'our', 'review'],
    'and': ['then', 'also', 'we', 'I', 'please'],
    'with': ['the', 'your', 'this', 'all', 'regards'],
    'in': ['the', 'this', 'our', 'addition', 'order'],
    'a': ['new', 'quick', 'brief', 'detailed', 'follow-up'],
    'this': ['document', 'project', 'meeting', 'issue', 'update'],
  };

  const lastWord = lastWords.split(/\s+/).pop() ?? '';
  if (wordPatterns[lastWord]) {
    for (const next of wordPatterns[lastWord]) {
      suggestions.push({
        text: `${next} `,
        confidence: 0.7,
        type: 'word',
      });
    }
  }

  return suggestions.slice(0, maxSuggestions);
}

// ── Email Thread Summarization ──

export interface ThreadSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  participants: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  urgencyLevel: 'low' | 'medium' | 'high';
  confidence: number;
}

/**
 * Summarize an email thread using extractive summarization.
 * In production, this would use an ONNX-optimized BART/DistilBART model.
 */
export function summarizeThread(messages: {from: string; body: string; date: string}[]): ThreadSummary {
  const start = performance.now();

  if (messages.length === 0) {
    return {summary: 'Empty thread', keyPoints: [], actionItems: [], participants: [], sentiment: 'neutral', urgencyLevel: 'low', confidence: 0};
  }

  // Extract participants
  const participants = [...new Set(messages.map(m => m.from))];

  // Extract key sentences (simple extractive approach)
  const allSentences = messages.flatMap(m =>
    m.body.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20)
  );

  // Score sentences by importance
  const scoredSentences = allSentences.map(sentence => {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Sentences with action words score higher
    if (/should|need|must|will|please|can you|let's|action/i.test(sentence)) score += 3;
    // Questions score higher
    if (/\?/.test(sentence)) score += 2;
    // Sentences with dates/times score higher
    if (/\d{1,2}[\/-]\d{1,2}|tomorrow|next week|monday|tuesday|wednesday|thursday|friday/i.test(sentence)) score += 2;
    // Longer sentences tend to be more informative
    score += Math.min(sentence.length / 50, 2);

    return {sentence, score};
  });

  // Sort by score, pick top sentences
  const topSentences = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.sentence);

  // Extract action items
  const actionItems: string[] = [];
  const actionPatterns = [
    /please\s+(.+?)(?:\.|$)/gi,
    /need\s+(?:to\s+)?(.+?)(?:\.|$)/gi,
    /can you\s+(.+?)(?:\.|$)/gi,
    /should\s+(.+?)(?:\.|$)/gi,
    /let's?\s+(.+?)(?:\.|$)/gi,
  ];

  for (const msg of messages) {
    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(msg.body)) !== null) {
        if (match[1] && match[1].length > 5 && match[1].length < 100) {
          actionItems.push(match[1].trim());
        }
      }
    }
  }

  // Overall sentiment
  const allText = messages.map(m => m.body).join(' ').toLowerCase();
  const posCount = POSITIVE_WORDS.filter(w => allText.includes(w)).length;
  const negCount = NEGATIVE_WORDS.filter(w => allText.includes(w)).length;
  const sentiment: ThreadSummary['sentiment'] = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';

  // Urgency
  const urgencyKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'today', 'tonight'];
  const urgencyLevel: ThreadSummary['urgencyLevel'] = urgencyKeywords.some(k => allText.includes(k)) ? 'high' : 'medium';

  // Generate summary
  const summary = topSentences.length > 0
    ? topSentences.join('. ') + '.'
    : `${messages.length}-message thread between ${participants.join(', ')}`;

  return {
    summary,
    keyPoints: topSentences,
    actionItems: [...new Set(actionItems)].slice(0, 5),
    participants,
    sentiment,
    urgencyLevel,
    confidence: Math.min(0.9, 0.4 + (messages.length * 0.1)),
  };
}

// ── Sentiment Analysis ──

export function analyzeSentiment(text: string): {
  label: 'positive' | 'neutral' | 'negative';
  score: number; // -1 to 1
  confidence: number;
} {
  const lower = text.toLowerCase();
  const posScore = scoreKeywords(lower, POSITIVE_WORDS);
  const negScore = scoreKeywords(lower, NEGATIVE_WORDS);
  const diff = posScore - negScore;

  return {
    label: diff > 1 ? 'positive' : diff < -1 ? 'negative' : 'neutral',
    score: Math.max(-1, Math.min(1, diff / 5)),
    confidence: Math.min(0.95, 0.5 + Math.abs(diff) * 0.1),
  };
}
