'use client';

/**
 * Conversational Search — chat-based document Q&A interface.
 *
 * Uses @anvil/ai for LLM-powered answers grounded in search results.
 * Maintains conversation context for follow-up questions.
 */

import {useState, useCallback, useRef, useEffect} from 'react';

// ── Types ──

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SearchResult[];
  timestamp: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevance: number;
  app: 'docs' | 'drive' | 'gmail' | 'youtube' | 'tasks' | 'calendar';
}

export interface ConversationalSearchState {
  messages: ConversationMessage[];
  isThinking: boolean;
  query: string;
}

// ── Context extraction ──

const CONTEXT_PROMPT = `You are an intelligent search assistant for Project Anvil — a federated productivity suite with Docs, Drive, Gmail, YouTube, Calendar, Tasks, and Search apps.

Given search results from the user's workspace, answer their question accurately. Cite sources using [1], [2] notation. If results are insufficient, say so honestly.

Rules:
- Be concise but thorough
- Always cite sources when using information from search results
- If multiple results conflict, note the discrepancy
- Suggest follow-up questions when appropriate
- Format key information in bullet points`;

function buildSearchContext(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No search results found for "${query}". Answer based on general knowledge but note that no matching documents were found.`;
  }

  return results
    .map((r, i) => `[${i + 1}] ${r.title} (${r.app})\n    ${r.snippet}`)
    .join('\n\n');
}

// ── Mock search (replace with real Meilisearch/pgvector) ──

const MOCK_RESULTS: SearchResult[] = [
  {title: 'Q4 Planning Document', url: '/docs/q4-planning', snippet: 'Quarterly planning notes covering OKRs, team allocations, and budget projections for Q4 2026...', relevance: 0.95, app: 'docs'},
  {title: 'Budget Spreadsheet', url: '/drive/budget-q4', snippet: 'Detailed line-item budget with projected vs actual spend, department breakdowns...', relevance: 0.88, app: 'drive'},
  {title: 'Re: Q4 kickoff meeting', url: '/gmail/msg-1234', snippet: 'Hey team, let\'s schedule the Q4 kickoff for next Monday. Please review the planning doc beforehand...', relevance: 0.82, app: 'gmail'},
  {title: 'Product Roadmap 2026', url: '/docs/roadmap-2026', snippet: 'Annual roadmap with milestones: Phase 1 (infra), Phase 2 (SSO), Phase 3 (apps)...', relevance: 0.78, app: 'docs'},
  {title: 'Team Standup Recording', url: '/youtube/vid-5678', snippet: 'Weekly standup discussing Q4 priorities, blockers, and action items...', relevance: 0.65, app: 'youtube'},
];

async function search(query: string): Promise<SearchResult[]> {
  // Simple keyword matching against mock data for demo
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const scored = MOCK_RESULTS.map(r => {
    const text = `${r.title} ${r.snippet}`.toLowerCase();
    const matchCount = terms.filter(t => text.includes(t)).length;
    const score = matchCount / terms.length;
    return {...r, relevance: Math.max(r.relevance * 0.5 + score * 0.5, score > 0 ? 0.4 : 0)};
  }).filter(r => r.relevance > 0.3);

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, 5);
}

// ── LLM response generator (rule-based fallback when no AI provider) ──

function generateResponse(query: string, results: SearchResult[], history: ConversationMessage[]): string {
  const isFollowUp = history.length > 1;
  const lower = query.toLowerCase();

  // Detect query intent
  const intents: Record<string, boolean> = {
    summary: lower.includes('summary') || lower.includes('summarize') || lower.includes('overview'),
    list: lower.includes('list') || lower.includes('what are') || lower.includes('show me'),
    comparison: lower.includes('compare') || lower.includes('difference') || lower.includes('vs'),
    detail: lower.includes('detail') || lower.includes('tell me about') || lower.includes('explain'),
    action: lower.includes('action items') || lower.includes('todo') || lower.includes('tasks'),
  };

  if (results.length === 0) {
    return `I couldn't find any documents matching "${query}". Try rephrasing your question or searching with different keywords.`;
  }

  let response = '';

  if (intents.summary) {
    response = `Here's a summary based on ${results.length} sources:\n\n`;
    response += results.slice(0, 3).map((r, i) =>
      `• **${r.title}** [${i + 1}]: ${r.snippet.split('.')[0]}.`
    ).join('\n');
  } else if (intents.list) {
    response = `Found ${results.length} relevant items:\n\n`;
    response += results.map((r, i) =>
      `${i + 1}. **${r.title}** (${r.app}) [${i + 1}]\n   ${r.snippet.split('.')[0]}`
    ).join('\n\n');
  } else if (intents.action) {
    response = `Based on the search results, here are the action items:\n\n`;
    results.forEach((r, i) => {
      const sentences = r.snippet.split(/[.!]/).filter(Boolean);
      sentences.slice(0, 2).forEach(s => {
        response += `• ${s.trim()} [${i + 1}]\n`;
      });
    });
  } else {
    response = `Based on your query, I found ${results.length} relevant results:\n\n`;
    response += results.slice(0, 3).map((r, i) =>
      `**${r.title}** [${i + 1}]\n${r.snippet.split('.').slice(0, 2).join('.')}.`
    ).join('\n\n');
  }

  // Suggest follow-ups
  if (!isFollowUp) {
    response += `\n\n—\n*Try asking: "Summarize ${results[0]?.title}" or "What are the action items?"*`;
  }

  return response;
}

// ── Hook ──

export function useConversationalSearch() {
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! I can help you find and understand information across your Anvil workspace. Ask me anything about your documents, emails, files, or calendar events.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const [query, setQuery] = useState('');

  const ask = useCallback(async (question: string) => {
    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setQuery('');

    try {
      // Search across workspace
      const results = await search(question);

      // Generate answer
      const answer = generateResponse(question, results, messages);

      const assistantMsg: ConversationMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: answer,
        sources: results,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ConversationMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I had trouble processing your question. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  }, [messages]);

  const clear = useCallback(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'Conversation cleared. How can I help you?',
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  return {messages, isThinking, query, setQuery, ask, clear};
}

// ── Component ──

export function ConversationalSearchPanel() {
  const {messages, isThinking, query, setQuery, ask, clear} = useConversationalSearch();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isThinking) {
      ask(query.trim());
    }
  };

  const SOURCES_COLORS: Record<string, string> = {
    docs: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    drive: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    gmail: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    youtube: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    tasks: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    calendar: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };

  const SUGGESTIONS = [
    'Summarize Q4 planning',
    'What are my action items?',
    'List recent documents',
    'Find budget information',
  ];

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">💬 Ask Anvil</h3>
          <p className="text-[10px] text-gray-500">Search across your workspace with AI</p>
        </div>
        <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            }`}>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="text-[10px] text-gray-500 uppercase font-semibold">Sources</div>
                  {msg.sources.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SOURCES_COLORS[s.app] || 'bg-gray-100 text-gray-600'}`}>
                        {s.app}
                      </span>
                      <div>
                        <a href={s.url} className="text-xs font-medium text-blue-500 hover:underline">[{i + 1}] {s.title}</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask about your documents, emails, files..."
            className="flex-1 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isThinking}
          />
          <button
            type="submit"
            disabled={!query.trim() || isThinking}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-blue-700"
          >
            →
          </button>
        </div>
      </form>
    </div>
  );
}
