'use client';

/**
 * AI Mail UI Components
 *
 * - ThreadSummaryPanel: Shows AI-generated thread summary
 * - SmartReplyBar: 1-click smart reply suggestions
 * - UnreadDigestModal: Summarize all unread mail
 * - SmartFilterPanel: AI-generated filter suggestions
 * - InboxCategoryTabs: Primary/Updates/Action Needed/FYI tabs
 * - AIComposeEnhanced: AI compose with thread context
 */

import {useState, useCallback, useMemo} from 'react';
import {useEditor, EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  type MailMessage,
  type InboxCategory,
  classifyInboxCategory,
  generateThreadSummary,
  generateSmartReplies,
  generateUnreadDigest,
  generateSmartFilters,
  semanticSearchEmails,
  INBOX_CATEGORY_CONFIG,
  buildComposeContext,
} from '../lib/ai-mail';

// ── Thread Summary Panel (Task 9) ──

export function ThreadSummaryPanel({messages}: {messages: MailMessage[]}) {
  const [summary, setSummary] = useState<ReturnType<typeof generateThreadSummary> | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);

  // Local summary (instant)
  const localSummary = useMemo(() => generateThreadSummary(messages), [messages]);

  const fetchAISummary = useCallback(async () => {
    setIsAILoading(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'summarize-thread',
          payload: {
            subject: messages[0]?.subject,
            messages: messages.map(m => ({from: m.from.name, body: m.body, date: m.date})),
          },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('AI thread summary failed:', err);
    } finally {
      setIsAILoading(false);
    }
  }, [messages]);

  const display = summary || localSummary;

  const sentimentColors: Record<string, string> = {
    positive: 'bg-green-50 border-green-200 text-green-700',
    neutral: 'bg-gray-50 border-gray-200 text-gray-700',
    negative: 'bg-red-50 border-red-200 text-red-700',
    urgent: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div className="border border-blue-200 rounded-lg p-3 mb-3 bg-blue-50/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-blue-700">🤖 Thread Summary</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${sentimentColors[display.sentiment]}`}>
            {display.sentiment}
          </span>
        </div>
        <button
          onClick={fetchAISummary}
          disabled={isAILoading}
          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {isAILoading ? 'Generating...' : '✨ AI Enhance'}
        </button>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{display.summary}</p>
      {display.keyPoints.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Key Points</p>
          <ul className="mt-0.5">
            {display.keyPoints.map((point, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                <span className="text-blue-400 mt-0.5">•</span> {point}
              </li>
            ))}
          </ul>
        </div>
      )}
      {display.actionItems.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase">Action Items</p>
          <ul className="mt-0.5">
            {display.actionItems.map((item, i) => (
              <li key={i} className="text-xs text-orange-600 flex items-start gap-1">
                <span className="mt-0.5">⚡</span> {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400">
        <span>{display.participants.length} participants:</span>
        {display.participants.slice(0, 4).map((p, i) => (
          <span key={i} className="text-gray-500">{p}{i < display.participants.length - 1 && i < 3 ? ',' : ''}</span>
        ))}
        {display.participants.length > 4 && <span>+{display.participants.length - 4} more</span>}
      </div>
    </div>
  );
}

// ── Smart Reply Bar (Task 12) ──

export function SmartReplyBar({messages, onReply}: {
  messages: MailMessage[];
  onReply: (text: string) => void;
}) {
  const replies = useMemo(() => generateSmartReplies(messages), [messages]);

  if (replies.length === 0) return null;

  const toneColors: Record<string, string> = {
    professional: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
    casual: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
    brief: 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200',
  };

  return (
    <div className="flex items-center gap-2 py-2 border-t border-gray-100">
      <span className="text-[10px] text-gray-400 font-medium">QUICK REPLY:</span>
      {replies.map((reply, i) => (
        <button
          key={i}
          onClick={() => onReply(reply.text)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${toneColors[reply.tone]}`}
          title={`Tone: ${reply.tone}`}
        >
          {reply.text}
        </button>
      ))}
    </div>
  );
}

// ── Unread Digest Modal (Task 11) ──

export function UnreadDigestModal({messages, onClose, onSelectEmail}: {
  messages: MailMessage[];
  onClose: () => void;
  onSelectEmail: (id: string) => void;
}) {
  const [aiDigest, setAiDigest] = useState<{digest: string; categories: Record<string, string[]>; priorities: string[]} | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);

  // Local digest (instant)
  const localDigest = useMemo(() => generateUnreadDigest(messages), [messages]);

  const fetchAIDigest = useCallback(async () => {
    setIsAILoading(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'digest',
          payload: {
            unreadEmails: messages.filter(m => !m.read).map(m => ({
              from: m.from.name,
              subject: m.subject,
              body: m.body,
              date: m.date,
            })),
          },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAiDigest(data);
      }
    } catch (err) {
      console.error('AI digest failed:', err);
    } finally {
      setIsAILoading(false);
    }
  }, [messages]);

  const digest = aiDigest || {digest: localDigest.summary, categories: {}, priorities: []};

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-lg">📬</span>
            <h3 className="font-semibold text-gray-900">Unread Digest</h3>
            <span className="text-xs text-gray-400">{localDigest.totalCount} unread</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAIDigest}
              disabled={isAILoading}
              className="px-3 py-1 text-xs bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50"
            >
              {isAILoading ? '⏳ AI Generating...' : '✨ AI Digest'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {/* Summary */}
          <p className="text-sm text-gray-700 mb-4">{digest.digest}</p>

          {/* Urgent alerts */}
          {localDigest.urgentCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-red-700">⚡ {localDigest.urgentCount} urgent {localDigest.urgentCount === 1 ? 'email' : 'emails'}</p>
            </div>
          )}

          {/* Priority list */}
          {digest.priorities?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Priority</p>
              {digest.priorities.map((p, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                  <span className="text-orange-500">{i + 1}.</span> {p}
                </div>
              ))}
            </div>
          )}

          {/* By category */}
          <div className="space-y-3">
            {(['action-needed', 'primary', 'updates', 'fyi'] as InboxCategory[]).map(cat => {
              const emails = localDigest.byCategory[cat];
              if (emails.length === 0) return null;
              const config = INBOX_CATEGORY_CONFIG[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-sm">{config.icon}</span>
                    <span className="text-xs font-semibold text-gray-500">{config.label}</span>
                    <span className="text-[10px] text-gray-400">({emails.length})</span>
                  </div>
                  {emails.slice(0, 5).map(email => (
                    <button
                      key={email.id}
                      onClick={() => { onSelectEmail(email.threadId); onClose(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded"
                    >
                      <span className="text-gray-400 text-xs">{email.from.name.split(' ')[0]}</span>
                      <span className="truncate">{email.subject}</span>
                    </button>
                  ))}
                  {emails.length > 5 && (
                    <p className="text-[10px] text-gray-400 pl-3">+{emails.length - 5} more</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Smart Filter Panel (Task 14) ──

export function SmartFilterPanel({messages, onApplyFilter}: {
  messages: MailMessage[];
  onApplyFilter: (filter: any) => void;
}) {
  const [filters] = useState(() => generateSmartFilters(messages));

  if (filters.length === 0) return null;

  return (
    <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/30 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">🤖</span>
        <span className="text-xs font-semibold text-purple-700">Suggested Filters</span>
      </div>
      <div className="space-y-1.5">
        {filters.slice(0, 5).map(filter => (
          <div key={filter.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-purple-100">
            <div>
              <p className="text-xs font-medium text-gray-700">{filter.name}</p>
              <p className="text-[10px] text-gray-400">{filter.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400">{Math.round(filter.confidence * 100)}%</span>
              <button
                onClick={() => onApplyFilter(filter)}
                className="px-2 py-0.5 text-[10px] bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inbox Category Tabs (Task 8) ──

export function InboxCategoryTabs({activeCategory, onCategoryChange, counts}: {
  activeCategory: InboxCategory | 'all';
  onCategoryChange: (cat: InboxCategory | 'all') => void;
  counts: Record<InboxCategory, number>;
}) {
  const tabs: Array<{id: InboxCategory | 'all'; label: string; icon: string; count?: number}> = [
    {id: 'all', label: 'All', icon: '📥', count: Object.values(counts).reduce((a, b) => a + b, 0)},
    {id: 'primary', label: 'Primary', icon: INBOX_CATEGORY_CONFIG.primary.icon, count: counts.primary},
    {id: 'action-needed', label: 'Action', icon: INBOX_CATEGORY_CONFIG['action-needed'].icon, count: counts['action-needed']},
    {id: 'updates', label: 'Updates', icon: INBOX_CATEGORY_CONFIG.updates.icon, count: counts.updates},
    {id: 'fyi', label: 'FYI', icon: INBOX_CATEGORY_CONFIG.fyi.icon, count: counts.fyi},
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-200 bg-white">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onCategoryChange(tab.id)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeCategory === tab.id
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          <span className="text-xs">{tab.icon}</span>
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className={`px-1 py-0 rounded text-[10px] ${
              activeCategory === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── AI Enhanced Compose (Task 10) ──

export function AIComposeModal({threadMessages, onClose, onSend}: {
  threadMessages?: MailMessage[];
  onClose: () => void;
  onSend: (to: string, subject: string, body: string) => void;
}) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(threadMessages?.[0]?.subject?.startsWith('Re:') ? threadMessages[0].subject : '');
  const [isAIDrafting, setIsAIDrafting] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({placeholder: 'Write your message...'}),
    ],
    content: '',
  });

  const composeCtx = useMemo(() =>
    threadMessages ? buildComposeContext(threadMessages) : null,
    [threadMessages]
  );

  const generateAIDraft = useCallback(async () => {
    if (!composeCtx) return;
    setIsAIDrafting(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'compose',
          payload: {
            threadMessages: composeCtx.recentMessages,
            subject: composeCtx.threadSummary,
            intent: 'reply',
            writingStyle: composeCtx.writingStyleHints,
          },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        editor?.commands.setContent(data.draft);
      }
    } catch (err) {
      console.error('AI compose failed:', err);
    } finally {
      setIsAIDrafting(false);
    }
  }, [composeCtx, editor]);

  // Auto-fill from thread
  const lastFromOther = threadMessages?.filter(m => m.from.email !== 'me@anvil.local').slice(-1)[0];

  const handleSend = () => {
    if (!to.trim() && lastFromOther) {
      onSend(lastFromOther.from.email, subject, editor?.getText() || '');
    } else if (to.trim()) {
      onSend(to, subject, editor?.getText() || '');
    }
    onClose();
  };

  return (
    <div className="fixed bottom-4 right-4 w-[560px] max-h-[500px] bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 rounded-t-lg border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">
          {composeCtx ? `Re: ${threadMessages?.[0]?.subject}` : 'New Message'}
        </span>
        <div className="flex items-center gap-1">
          {composeCtx && (
            <button
              onClick={generateAIDraft}
              disabled={isAIDrafting}
              className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50"
            >
              {isAIDrafting ? '⏳ Drafting...' : '✨ AI Draft'}
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex items-center px-4 py-2">
          <span className="text-xs text-gray-500 w-12">To</span>
          <input
            value={to || lastFromOther?.from.email || ''}
            onChange={e => setTo(e.target.value)}
            className="flex-1 text-sm outline-none"
            placeholder="recipient@email.com"
          />
        </div>
        <div className="flex items-center px-4 py-2 border-t border-gray-100">
          <span className="text-xs text-gray-500 w-12">Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} className="flex-1 text-sm outline-none" placeholder="Subject" />
        </div>
      </div>

      {/* AI context hint */}
      {composeCtx && composeCtx.writingStyleHints && (
        <div className="px-4 py-1 bg-purple-50 text-[10px] text-purple-600">
          ✨ AI detected style: {composeCtx.writingStyleHints} · {composeCtx.participants.length} participants in thread
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {editor && <EditorContent editor={editor} className="tiptap" />}
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200">
        <button onClick={handleSend} className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
          Send
        </button>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100" title="Discard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
        </button>
      </div>
    </div>
  );
}

// ── Semantic Search Bar (Task 13) ──

export function SemanticSearchBar({messages, onSelectEmail}: {
  messages: MailMessage[];
  onSelectEmail: (threadId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{email: MailMessage; score: number; matchedFields: string[]}>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    if (!searchQuery.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setShowResults(true);
    setIsSearching(true);

    // Local semantic search (instant)
    const localResults = semanticSearchEmails(searchQuery, messages, {maxResults: 10});
    setResults(localResults);
    setIsSearching(false);
  }, [messages]);

  const handleAISearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'semantic-search',
          payload: {
            query,
            emails: messages.map(m => ({id: m.id, from: m.from.email, subject: m.subject, body: m.body})),
          },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        // Merge AI results with local messages
        const aiResults = data.results.map((r: any) => {
          const email = messages.find(m => m.id === r.id);
          return email ? {email, score: r.relevance, matchedFields: [r.reason]} : null;
        }).filter(Boolean);
        if (aiResults.length > 0) {
          setResults(aiResults as any);
        }
      }
    } catch (err) {
      console.error('AI search failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, [query, messages]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
        <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search mail (semantic)..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {query && (
          <button
            onClick={handleAISearch}
            disabled={isSearching}
            className="text-[10px] text-purple-600 hover:text-purple-800 disabled:opacity-50"
          >
            {isSearching ? '⏳' : '✨ AI'}
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-[300px] overflow-auto">
          {results.map((result, i) => (
            <button
              key={i}
              onClick={() => { onSelectEmail(result.email.threadId); setShowResults(false); setQuery(''); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-50 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-gray-700">{result.email.from.name}</span>
                  <span className="text-[10px] text-gray-400">· {result.email.subject}</span>
                </div>
                <p className="text-[10px] text-gray-400 truncate">{result.email.body.slice(0, 80)}</p>
              </div>
              <div className="flex items-center gap-1">
                {result.matchedFields.map(f => (
                  <span key={f} className="px-1 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded">{f}</span>
                ))}
                <span className="text-[10px] text-gray-400">{Math.round(result.score * 10)}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
