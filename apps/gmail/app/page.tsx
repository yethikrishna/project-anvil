'use client';

import { useState, useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { AppShell, ThemeProvider, ThemeToggle, cn, Badge } from '@anvil/ui';
import { NotificationProvider, NotificationBell } from '@anvil/notifications';
import { classifyEmail, CATEGORY_CONFIG, type EmailCategory } from './lib/ai-categorizer';
import {
  type InboxCategory,
  classifyInboxCategory,
  INBOX_CATEGORY_CONFIG,
} from './lib/ai-mail';
import {
  classifyEnhanced,
  recordCorrection,
  type EnhancedCategoryResult,
} from './lib/ai-categorizer-enhanced';
import { analyzeWritingStyle, getStyleHints, buildComposePrompt } from './lib/writing-style-analyzer';
import {
  ThreadSummaryPanel,
  SmartReplyBar,
  UnreadDigestModal,
  SmartFilterPanel,
  InboxCategoryTabs,
  AIComposeModal,
  SemanticSearchBar,
} from './components/ai-mail-ui';
import { semanticSearch as semanticSearchAI } from './lib/semantic-email-search';
import { EmailRulesManager } from './components/email-rules-manager';
import { FollowUpPanel } from './components/follow-up-panel';
import { SmartRulesManager, DeadlineExtractor } from './components/smart-rules-manager';
import { scoreInbox, scoreEmailPriority, recordInteraction, loadPriorityConfig, type PriorityScore } from './lib/priority-inbox-scorer';
import CalendarView from './components/calendar-view';
import ContactsView from './components/contacts-view';
import { SenderContextBadge } from './lib/sender-context';
import { AIAttachmentList } from './components/ai-attachment-summarizer';
import { SmartSnoozeMenu, SendTimeOptimizer } from './lib/snooze-intelligence';
import { AIContactCard, extractContactFromEmail } from './components/ai-contact-intelligence';
import { MeetingDetectorCard } from './components/ai-meeting-detector';
import { UnsubscribeBanner, detectUnsubscribeInfo } from './components/ai-unsubscribe';
import { SmartLabelBadges } from './lib/smart-labels';
import { KeyPointsCard } from './components/ai-key-points';
import { WaitingReplyBadge, calculateWaitTime } from './components/ai-response-intelligence';
import { EmailEmotionBadge } from './components/ai-emotion-detector';

// ─── Types ───

interface MailMessage {
  id: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc?: { name: string; email: string }[];
  subject: string;
  body: string;
  htmlBody?: string;
  date: string;
  read: boolean;
  starred: boolean;
  labels: string[];
  threadId: string;
  attachments?: { name: string; size: string; type: string }[];
}

type MailFolder = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash';
type AppView = 'mail' | 'calendar' | 'contacts';

// ─── Mock Data ───

const MOCK_THREADS: Record<string, MailMessage[]> = {
  'thread-1': [
    {
      id: 'msg-1',
      from: { name: 'Sarah Chen', email: 'sarah@company.com' },
      to: [{ name: 'Me', email: 'me@anvil.local' }],
      subject: 'Sprint Review — Friday 3pm',
      body: 'Hey team,\n\nQuick reminder about our sprint review this Friday at 3pm. Please have your demo slots ready.\n\nBest,\nSarah',
      date: '2026-05-20T10:24:00Z',
      read: false,
      starred: true,
      labels: ['work'],
      threadId: 'thread-1',
    },
    {
      id: 'msg-1-reply',
      from: { name: 'Me', email: 'me@anvil.local' },
      to: [{ name: 'Sarah Chen', email: 'sarah@company.com' }],
      subject: 'Re: Sprint Review — Friday 3pm',
      body: 'Got it! I\'ll have the MapLibre integration demo ready.\n\nThanks,\nMe',
      date: '2026-05-20T10:45:00Z',
      read: true,
      starred: false,
      labels: ['work'],
      threadId: 'thread-1',
    },
  ],
  'thread-2': [
    {
      id: 'msg-2',
      from: { name: 'GitHub', email: 'noreply@github.com' },
      to: [{ name: 'Me', email: 'me@anvil.local' }],
      subject: '[project-anvil] PR #42 merged',
      body: 'Your pull request "feat: Phase 6 — Maps Clone" has been merged into main branch.\n\n+722 lines changed across 5 files.',
      date: '2026-05-20T09:15:00Z',
      read: false,
      starred: false,
      labels: ['github'],
      threadId: 'thread-2',
    },
  ],
  'thread-3': [
    {
      id: 'msg-3',
      from: { name: 'Tech Weekly', email: 'newsletter@techweekly.com' },
      to: [{ name: 'Me', email: 'me@anvil.local' }],
      subject: 'This Week in AI: Agent Orchestration',
      body: 'The latest trends in AI agent frameworks and orchestration tools...\n\nIn this issue:\n- Multi-agent systems\n- Tool-use patterns\n- Safety guardrails\n- Production deployments',
      date: '2026-05-19T14:00:00Z',
      read: true,
      starred: false,
      labels: ['newsletter'],
      threadId: 'thread-3',
    },
  ],
  'thread-4': [
    {
      id: 'msg-4',
      from: { name: 'HR Team', email: 'hr@company.com' },
      to: [{ name: 'All Staff', email: 'all@company.com' }],
      subject: 'Benefits enrollment reminder',
      body: 'Open enrollment closes next week. Please review your selections in the HR portal before May 27th.\n\nKey changes this year:\n- New dental plan options\n- Increased HSA contribution limits\n- Telehealth benefit expansion',
      date: '2026-05-19T11:00:00Z',
      read: true,
      starred: true,
      labels: ['work', 'important'],
      threadId: 'thread-4',
      attachments: [{ name: 'benefits-guide-2026.pdf', size: '2.4 MB', type: 'pdf' }],
    },
  ],
  'thread-5': [
    {
      id: 'msg-5',
      from: { name: 'Vercel', email: 'deploy@vercel.com' },
      to: [{ name: 'Me', email: 'me@anvil.local' }],
      subject: 'Deployment successful — anvil-drive',
      body: 'Your deployment to production was successful.\n\nBuild time: 42s\nDomain: anvil-drive.vercel.app\nCommit: feat: Phase 3 — Drive Clone',
      date: '2026-05-18T16:30:00Z',
      read: true,
      starred: false,
      labels: ['deploy'],
      threadId: 'thread-5',
    },
  ],
  'thread-6': [
    {
      id: 'msg-6',
      from: { name: 'Alex Rivera', email: 'alex@startup.io' },
      to: [{ name: 'Me', email: 'me@anvil.local' }],
      subject: 'Re: Coffee chat next week?',
      body: 'Hey! Tuesday at 2pm works great. Let\'s do it at the usual spot.\n\nCheers,\nAlex',
      date: '2026-05-18T09:00:00Z',
      read: true,
      starred: false,
      labels: [],
      threadId: 'thread-6',
    },
    {
      id: 'msg-6-2',
      from: { name: 'Me', email: 'me@anvil.local' },
      to: [{ name: 'Alex Rivera', email: 'alex@startup.io' }],
      subject: 'Coffee chat next week?',
      body: 'Hey Alex,\n\nFree for a coffee chat next week? I have some ideas I\'d love to bounce off you.\n\nBest,\nMe',
      date: '2026-05-17T15:00:00Z',
      read: true,
      starred: false,
      labels: [],
      threadId: 'thread-6',
    },
  ],
  'thread-7': [
    {
      id: 'msg-7',
      from: { name: 'Spam Bot', email: 'winner@totallylegit.biz' },
      to: [{ name: 'Me', email: 'me@anvil.local' }],
      subject: 'YOU WON $1,000,000!!!',
      body: 'Congratulations! Click here to claim your prize...',
      date: '2026-05-17T03:00:00Z',
      read: true,
      starred: false,
      labels: ['spam'],
      threadId: 'thread-7',
    },
  ],
};

// Build flat list from threads
const ALL_MESSAGES: MailMessage[] = Object.values(MOCK_THREADS).flat();

// ─── Label colors ───

const LABEL_COLORS: Record<string, string> = {
  work: 'bg-blue-100 text-blue-700',
  github: 'bg-purple-100 text-purple-700',
  newsletter: 'bg-orange-100 text-orange-700',
  deploy: 'bg-green-100 text-green-700',
  important: 'bg-red-100 text-red-700',
  spam: 'bg-gray-100 text-gray-600',
  personal: 'bg-cyan-100 text-cyan-700',
};

// ─── Compose Modal ───

function ComposeModal({ onClose, onSend }: { onClose: () => void; onSend: (to: string, subject: string, body: string) => void }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your message...' }),
    ],
    content: '',
  });

  const handleSend = () => {
    if (!to.trim()) return;
    onSend(to, subject, editor?.getText() || '');
    onClose();
  };

  return (
    <div className="fixed bottom-4 right-4 w-[540px] max-h-[500px] bg-white rounded-lg shadow-2xl border border-gray-300 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 rounded-t-lg border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">New Message</span>
        <div className="flex items-center gap-1">
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 text-gray-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="border-b border-gray-200">
        <div className="flex items-center px-4 py-2">
          <span className="text-xs text-gray-500 w-12">To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 text-sm outline-none" placeholder="recipient@email.com" />
        </div>
        <div className="flex items-center px-4 py-2 border-t border-gray-100">
          <span className="text-xs text-gray-500 w-12">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 text-sm outline-none" placeholder="Subject" />
        </div>
      </div>

      {/* Tiptap editor */}
      <div className="flex-1 overflow-auto">
        {editor && <EditorContent editor={editor} className="tiptap" />}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200">
        <div className="flex items-center gap-1">
          <button onClick={handleSend} className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
            Send
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="Bold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>
          </button>
          <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="Italic">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
          </button>
          <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="Bullet list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 ml-2" title="Discard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Thread View ───

function ThreadView({ messages, allMessages, onBack, onStar, onArchive, onDelete, onSpam }: {
  messages: MailMessage[];
  allMessages: MailMessage[];
  onBack: () => void;
  onStar: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSpam: (id: string) => void;
}) {
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(() => {
    // Expand the last (most recent) message by default
    const set = new Set<string>();
    if (messages.length > 0) set.add(messages[messages.length - 1].id);
    return set;
  });
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<Date | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedMsgs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const subject = messages[0]?.subject || '';
  const sortedMessages = [...messages].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200">
        <button onClick={onBack} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <button onClick={() => onArchive(messages[0].id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Archive">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
        </button>
        <button onClick={() => onSpam(messages[0].id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Report spam">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        </button>
        <button onClick={() => onDelete(messages[0].id)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Delete">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
        </button>
        {/* Smart Snooze */}
        <div className="relative">
          <button
            onClick={() => setShowSnooze(s => !s)}
            className={cn('px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1', snoozedUntil ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:bg-gray-100')}
            title="Snooze this thread"
          >
            ⏰ {snoozedUntil ? `Until ${snoozedUntil.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}` : 'Snooze'}
          </button>
          {showSnooze && messages[0] && (
            <SmartSnoozeMenu
              email={messages[0]}
              emailId={messages[0].id}
              onSnooze={(until, reason) => { setSnoozedUntil(until); setShowSnooze(false); }}
              onClose={() => setShowSnooze(false)}
            />
          )}
        </div>
        <div className="flex-1" />
        {messages[0]?.labels.map((l) => (
          <span key={l} className={cn('px-2 py-0.5 rounded-full text-xs font-medium', LABEL_COLORS[l] || 'bg-gray-100 text-gray-700')}>
            {l}
          </span>
        ))}
      </div>

      {/* Subject */}
      <div className="px-6 pt-4 pb-2">
        <h2 className="text-xl font-normal text-gray-900">{subject}</h2>
        {messages[0] && (
          <div className="mt-1.5">
            <SmartLabelBadges
              subject={messages[0].subject}
              body={messages[0].body}
              senderEmail={messages[0].from.email}
              appliedLabels={messages[0].labels || []}
              onApply={(label) => console.log('Applying label:', label)}
            />
          </div>
        )}
      </div>

      {/* AI Thread Summary */}
      <div className="px-6">
        <ThreadSummaryPanel messages={messages} />
      </div>

      {/* AI Key Points */}
      {messages.length >= 2 && (
        <div className="px-6 pb-2">
          <KeyPointsCard
            messages={messages}
            onAddToTasks={(point) => console.log('Adding task:', point)}
          />
        </div>
      )}

      {/* Sender Context (Conversation Memory) */}
      {messages[0] && (
        <div className="px-6 pb-2">
          <SenderContextBadge
            senderEmail={messages[0].from.email}
            senderName={messages[0].from.name}
            allMessages={allMessages}
            currentEmail={messages[0]}
          />
        </div>
      )}

      {/* Unsubscribe Banner */}
      {messages[0] && messages[0].from.email !== 'me@anvil.local' && (() => {
        const info = detectUnsubscribeInfo(messages[0].subject, messages[0].body);
        if (!info) return null;
        return (
          <div className="px-6 pb-2">
            <UnsubscribeBanner
              info={info}
              senderName={messages[0].from.name}
              senderEmail={messages[0].from.email}
              onUnsubscribe={(method, target) => console.log('Unsubscribed:', method, target)}
            />
          </div>
        );
      })()}

      {/* Waiting Reply Badge */}
      {(() => {
        const waitInfo = calculateWaitTime(messages);
        if (!waitInfo) return null;
        const lastMsg = messages[messages.length - 1];
        const recipients = lastMsg?.to || [];
        const recipientName = recipients[0]?.name || recipients[0]?.email || 'recipient';
        return (
          <div className="px-6 pb-2">
            <WaitingReplyBadge
              info={waitInfo}
              recipientName={recipientName}
              subject={messages[0]?.subject || ''}
              onFollowUp={() => console.log('Follow up requested')}
            />
          </div>
        );
      })()}

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 pb-4">
        {sortedMessages.map((msg) => {
          const isExpanded = expandedMsgs.has(msg.id);
          const date = new Date(msg.date);
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

          return (
            <div key={msg.id} className="border border-gray-200 rounded-lg mb-2 overflow-hidden">
              {/* Message header */}
              <button
                onClick={() => toggleExpand(msg.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium shrink-0">
                  {msg.from.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{msg.from.name}</span>
                    <span className="text-xs text-gray-400">&lt;{msg.from.email}&gt;</span>
                    {msg.from.email !== 'me@anvil.local' && (
                      <EmailEmotionBadge body={msg.body} subject={msg.subject} showTip />
                    )}
                  </div>
                  <p className="text-xs text-gray-500">to {msg.to.map((t) => t.name).join(', ')}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{dateStr} {timeStr}</span>
                <svg className={cn('w-4 h-4 text-gray-400 transition-transform shrink-0', isExpanded && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </button>

              {/* Message body */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1">
                  <div className="pl-11">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">{msg.body}</pre>
                    {/* AI Attachment Summarizer */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-3">
                        <AIAttachmentList
                          attachments={msg.attachments}
                          emailContext={`${msg.subject}: ${msg.body.slice(0, 200)}`}
                        />
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => onStar(msg.id)}
                        className={cn('p-1 rounded hover:bg-gray-100', msg.starred ? 'text-yellow-500' : 'text-gray-400')}
                      >
                        {msg.starred ? '★' : '☆'}
                      </button>
                      <button className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                        Reply
                      </button>
                      <button className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                        Forward
                      </button>
                    </div>
                    {/* AI Contact Intelligence */}
                    {msg.from.email !== 'me@anvil.local' && (() => {
                      const contact = extractContactFromEmail(msg.from.name, msg.from.email, msg.body);
                      return (
                        <AIContactCard
                          contact={contact}
                          onSave={(c) => console.log('Saving contact:', c)}
                        />
                      );
                    })()}
                    {/* AI Meeting Detector */}
                    {msg.from.email !== 'me@anvil.local' && (
                      <MeetingDetectorCard
                        subject={msg.subject}
                        body={msg.body}
                        fromName={msg.from.name}
                        onAddToCalendar={(meeting) => console.log('Adding to calendar:', meeting)}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Smart Replies + Send Time Optimizer */}
      <div className="border-t border-gray-200 px-6">
        <SmartReplyBar
          messages={messages}
          onReply={(text) => {
            console.log('Smart reply:', text);
          }}
        />
        {/* Send Time Optimizer */}
        {messages[0] && (
          <SendTimeOptimizer
            recipientEmail={messages.filter(m => m.from.email !== 'me@anvil.local')[0]?.from.email || messages[0].from.email}
            threadHistory={messages.map(m => ({date: m.date}))}
            onSendNow={() => console.log('Send now')}
            onSchedule={(sendAt) => console.log('Scheduled for:', sendAt)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Gmail Page ───

export default function GmailPage() {
  const [messages, setMessages] = useState<MailMessage[]>(ALL_MESSAGES);
  const [appView, setAppView] = useState<AppView>('mail');
  const [selectedFolder, setSelectedFolder] = useState<MailFolder>('inbox');
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeInboxCategory, setActiveInboxCategory] = useState<InboxCategory | 'all'>('all');
  const [showDigest, setShowDigest] = useState(false);
  const [showSmartFilters, setShowSmartFilters] = useState(false);
  const [showRulesManager, setShowRulesManager] = useState(false);
  const [showFollowUps, setShowFollowUps] = useState(false);

  // Compute inbox category counts (enhanced with priority detection)
  const inboxCategoryCounts = useMemo(() => {
    const counts: Record<InboxCategory, number> = {primary: 0, updates: 0, 'action-needed': 0, fyi: 0};
    for (const m of messages) {
      if (m.read || m.labels.includes('spam') || m.labels.includes('archive') || m.labels.includes('trash')) continue;
      const cat = classifyEnhanced({subject: m.subject, from: m.from.email, body: m.body});
      counts[cat.category]++;
    }
    return counts;
  }, [messages]);

  // Filter messages by folder
  const filteredMessages = useMemo(() => {
    let filtered = messages;
    switch (selectedFolder) {
      case 'starred':
        filtered = filtered.filter((m) => m.starred);
        break;
      case 'spam':
        filtered = filtered.filter((m) => m.labels.includes('spam'));
        break;
      case 'archive':
        filtered = filtered.filter((m) => m.labels.includes('archive'));
        break;
      case 'trash':
        filtered = filtered.filter((m) => m.labels.includes('trash'));
        break;
      case 'sent':
        filtered = filtered.filter((m) => m.from.email === 'me@anvil.local');
        break;
      case 'drafts':
        filtered = filtered.filter((m) => m.labels.includes('draft'));
        break;
      default: // inbox — everything not in spam/archive/trash
        filtered = filtered.filter((m) => !m.labels.includes('spam') && !m.labels.includes('archive') && !m.labels.includes('trash'));
    }

    // AI inbox category filter (enhanced)
    if (selectedFolder === 'inbox' && activeInboxCategory !== 'all') {
      filtered = filtered.filter((m) => {
        const cat = classifyEnhanced({subject: m.subject, from: m.from.email, body: m.body});
        return cat.category === activeInboxCategory;
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.from.name.toLowerCase().includes(q) ||
          m.from.email.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q)
      );
    }

    // Group by thread, take only first (latest) message per thread
    const seenThreads = new Set<string>();
    return filtered.filter((m) => {
      if (seenThreads.has(m.threadId)) return false;
      seenThreads.add(m.threadId);
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [messages, selectedFolder, searchQuery, activeInboxCategory]);

  const unreadCount = messages.filter((m) => !m.read && !m.labels.includes('spam') && !m.labels.includes('trash')).length;

  const handleStar = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, starred: !m.starred } : m));
  }, []);

  const handleArchive = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, labels: [...m.labels, 'archive'] } : m));
    setSelectedThread(null);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, labels: [...m.labels, 'trash'] } : m));
    setSelectedThread(null);
  }, []);

  const handleSpam = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, labels: [...m.labels, 'spam'] } : m));
    setSelectedThread(null);
  }, []);

  const handleMarkRead = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, read: true } : m));
  }, []);

  const handleSend = useCallback((to: string, subject: string, body: string) => {
    const newMsg: MailMessage = {
      id: `msg-sent-${Date.now()}`,
      from: { name: 'Me', email: 'me@anvil.local' },
      to: [{ name: to.split('@')[0], email: to }],
      subject,
      body,
      date: new Date().toISOString(),
      read: true,
      starred: false,
      labels: [],
      threadId: `thread-sent-${Date.now()}`,
    };
    setMessages((prev) => [...prev, newMsg]);
  }, []);

  // Thread messages
  const threadMessages = selectedThread ? (MOCK_THREADS[selectedThread] || messages.filter((m) => m.threadId === selectedThread)) : [];

  // Sidebar nav items
  const navItems: { id: MailFolder; label: string; icon: string; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: '📥', count: unreadCount },
    { id: 'starred', label: 'Starred', icon: '⭐' },
    { id: 'sent', label: 'Sent', icon: '📤' },
    { id: 'drafts', label: 'Drafts', icon: '📝' },
    { id: 'archive', label: 'Archive', icon: '📦' },
    { id: 'spam', label: 'Spam', icon: '🚫' },
    { id: 'trash', label: 'Trash', icon: '🗑️' },
  ];

  return (
    <ThemeProvider>
    <NotificationProvider userId="demo-user">
    <AppShell
      activeApp="gmail"
      user={{ name: 'Demo User', email: 'demo@anvil.local' }}
      header={
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mail</h1>
        </div>
      }
      sidebarContent={
        <>
          <div className="mb-3">
            <button
              onClick={() => setShowCompose(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 dark:bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 font-medium shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              Compose
            </button>
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelectedFolder(item.id); setSelectedThread(null); setAppView('mail'); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                selectedFolder === item.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              <span className="text-sm">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{item.count}</span>
              )}
            </button>
          ))}
          {/* Calendar & Contacts shortcuts */}
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-1">
            <button
              onClick={() => setShowDigest(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <span className="text-sm">✨</span>
              <span className="flex-1 text-left">AI Digest</span>
              {unreadCount > 0 && <span className="text-[10px] text-purple-500">{unreadCount}</span>}
            </button>
            <button
              onClick={() => setShowSmartFilters(!showSmartFilters)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <span className="text-sm">🤖</span>
              <span className="flex-1 text-left">Smart Filters</span>
            </button>
            <button
              onClick={() => setShowRulesManager(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <span className="text-sm">⚙️</span>
              <span className="flex-1 text-left">Rules</span>
            </button>
            <button
              onClick={() => setShowFollowUps(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-purple-600 hover:bg-purple-50 transition-colors"
            >
              <span className="text-sm">🔔</span>
              <span className="flex-1 text-left">Follow-ups</span>
            </button>
            <button
              onClick={() => setAppView('calendar')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                appView === 'calendar' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              <span className="text-sm">📅</span>
              <span className="flex-1 text-left">Calendar</span>
            </button>
            <button
              onClick={() => setAppView('contacts')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                appView === 'contacts' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              <span className="text-sm">👥</span>
              <span className="flex-1 text-left">Contacts</span>
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1 px-3">Labels</p>
            {['work', 'github', 'newsletter', 'deploy', 'important'].map((label) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer">
                <span className={cn('w-2.5 h-2.5 rounded-full', LABEL_COLORS[label]?.split(' ')[0] || 'bg-gray-300')} />
                {label}
              </div>
            ))}
          </div>
        </>
      }
      notifications={<><ThemeToggle /><NotificationBell /></>}
    >
    <div className="flex h-full">
      {/* Calendar & Contacts views */}
      {appView === 'calendar' ? (
        <CalendarView />
      ) : appView === 'contacts' ? (
        <ContactsView />
      ) : selectedThread ? (
        <ThreadView
          messages={threadMessages}
          allMessages={messages}
          onBack={() => setSelectedThread(null)}
          onStar={handleStar}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onSpam={handleSpam}
        />
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Smart Filters (collapsible) */}
          {showSmartFilters && (
            <SmartFilterPanel
              messages={messages}
              onApplyFilter={(filter) => {
                // Apply filter logic
                console.log('Applied filter:', filter);
              }}
            />
          )}
          {/* Search bar — now with semantic search */}
          <div className="px-4 py-2 border-b border-gray-200 bg-white">
            <SemanticSearchBar messages={messages} onSelectEmail={(threadId) => setSelectedThread(threadId)} />
          </div>

          {/* AI Inbox Category Tabs */}
          {selectedFolder === 'inbox' && (
            <InboxCategoryTabs
              activeCategory={activeInboxCategory}
              onCategoryChange={setActiveInboxCategory}
              counts={inboxCategoryCounts}
            />
          )}

          {/* Mail list */}
          <div className="flex-1 overflow-auto bg-white">
            {/* Select all checkbox area */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100">
              <input type="checkbox" className="rounded" />
              <button className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="Refresh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" /></svg>
              </button>
            </div>

            {filteredMessages.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-4xl mb-2">📭</p>
                <p className="text-gray-400 text-sm">No messages in {selectedFolder}</p>
              </div>
            ) : (
              filteredMessages.map((mail) => {
                const date = new Date(mail.date);
                const isToday = date.toDateString() === new Date().toDateString();
                const timeStr = isToday
                  ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                const threadMsgs = MOCK_THREADS[mail.threadId] || [mail];
                const hasReplies = threadMsgs.length > 1;

                // Priority scoring
                const priorityConfig = loadPriorityConfig();
                const priority = scoreEmailPriority(mail, threadMsgs, priorityConfig);
                const tierColors: Record<string, string> = {
                  critical: 'text-red-600',
                  high: 'text-orange-500',
                  normal: 'text-gray-400',
                  low: 'text-gray-300',
                  bulk: 'text-gray-200',
                };
                const tierIcons: Record<string, string> = {
                  critical: '🔴',
                  high: '🟠',
                  normal: '',
                  low: '',
                  bulk: '',
                };

                return (
                  <div
                    key={mail.id}
                    onClick={() => { setSelectedThread(mail.threadId); handleMarkRead(mail.id); }}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 group',
                      !mail.read && 'bg-blue-50/40'
                    )}
                  >
                    <input
                      type="checkbox"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded shrink-0"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStar(mail.id); }}
                      className={cn('text-sm shrink-0 hover:scale-110 transition-transform', mail.starred ? 'text-yellow-500' : 'text-gray-300 hover:text-gray-500')}
                    >
                      {mail.starred ? '★' : '☆'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm', !mail.read ? 'font-semibold text-gray-900' : 'text-gray-600')}>
                          {mail.from.name}
                        </span>
                        {hasReplies && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                            {threadMsgs.length}
                          </span>
                        )}
                        {mail.labels.filter((l) => l !== 'spam' && l !== 'archive' && l !== 'trash').map((l) => (
                          <span key={l} className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', LABEL_COLORS[l] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400')}>
                            {l}
                          </span>
                        ))}
                        {/* AI Category Badge */}
                        {(() => {
                          const cat = classifyEmail({ subject: mail.subject, from: mail.from.email, body: mail.body });
                          const cfg = CATEGORY_CONFIG[cat.category];
                          return cat.confidence > 0.4 ? (
                            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-0.5', cfg.color)} title={`AI: ${cat.confidence}% confidence${cat.reasoning ? ' — ' + cat.reasoning : ''}`}>
                              {cfg.icon} {cfg.label}
                            </span>
                          ) : null;
                        })()}
                        {mail.attachments && mail.attachments.length > 0 && (
                          <svg className="w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                        )}
                      </div>
                      <p className={cn('text-sm truncate', !mail.read ? 'font-medium text-gray-800' : 'text-gray-600')}>
                        {tierIcons[priority.tier] && <span className="mr-1" title={`Priority: ${priority.tier} (${priority.overall}/100) — ${priority.reasons.join(', ')}`}>{tierIcons[priority.tier]}</span>}
                        {mail.subject}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{mail.body.slice(0, 80)}...</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{timeStr}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Compose modal — AI enhanced */}
      {showCompose && (
        <AIComposeModal
          threadMessages={selectedThread ? threadMessages : undefined}
          onClose={() => setShowCompose(false)}
          onSend={handleSend}
        />
      )}

      {/* Unread Digest Modal */}
      {showDigest && (
        <UnreadDigestModal
          messages={messages}
          onClose={() => setShowDigest(false)}
          onSelectEmail={(threadId) => { setSelectedThread(threadId); setShowDigest(false); }}
        />
      )}

      {/* Rules Manager */}
      {showRulesManager && (
        <EmailRulesManager
          messages={messages}
          onClose={() => setShowRulesManager(false)}
          onRuleApplied={(rule) => {
            console.log('Applied rule:', rule.name);
          }}
        />
      )}

      {/* Follow-Up Reminders */}
      {showFollowUps && (
        <FollowUpPanel
          messages={messages}
          onCompose={(to, subject, context) => {
            setShowFollowUps(false);
            setShowCompose(true);
          }}
          onSelectThread={(threadId) => {
            setSelectedThread(threadId);
            setShowFollowUps(false);
          }}
          onClose={() => setShowFollowUps(false)}
        />
      )}
    </div>
    </AppShell>
    </NotificationProvider>
    </ThemeProvider>
  );
}
