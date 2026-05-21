'use client';

/**
 * AI Document Assistant Panel
 *
 * Floating sidebar panel for the document AI assistant.
 * Shows document health, smart suggestions, and Q&A chat.
 */

import {useState, useRef, useEffect} from 'react';
import type {Editor} from '@tiptap/react';
import {useAIAssistant, type AIAssistantMessage} from '../ai/use-ai-assistant';

// ── Props ──

interface AIAssistantPanelProps {
  editor: Editor | null;
  onClose: () => void;
}

// ── Component ──

export function AIAssistantPanel({editor, onClose}: AIAssistantPanelProps) {
  const {
    messages,
    isLoading,
    documentHealth,
    suggestions,
    askQuestion,
    fixAllGrammar,
    generateTOC,
    clearMessages,
  } = useAIAssistant(editor);

  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    askQuestion(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm">✨</span>
          <span className="text-sm font-semibold text-gray-900">AI Assistant</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Document Health */}
      {documentHealth && (
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Document Health</span>
            <span className={`text-xs font-bold ${
              documentHealth.overallScore >= 80 ? 'text-green-600' :
              documentHealth.overallScore >= 50 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {documentHealth.overallScore}/100
            </span>
          </div>

          {/* Score bars */}
          <div className="space-y-1.5">
            <ScoreBar label="Structure" score={documentHealth.structure} />
            <ScoreBar label="Readability" score={documentHealth.readability} />
            <ScoreBar label="Completeness" score={documentHealth.completeness} />
          </div>

          {/* Quick actions */}
          <div className="mt-3 flex flex-wrap gap-1">
            <button
              onClick={fixAllGrammar}
              disabled={isLoading}
              className="px-2 py-1 text-[10px] bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              Fix Grammar
            </button>
            <button
              onClick={generateTOC}
              disabled={isLoading}
              className="px-2 py-1 text-[10px] bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              Add TOC
            </button>
          </div>
        </div>
      )}

      {/* Smart Suggestions */}
      {suggestions.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Suggestions</span>
          <div className="mt-1 space-y-1">
            {suggestions.slice(0, 3).map((suggestion, i) => (
              <button
                key={i}
                onClick={() => askQuestion(suggestion)}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
              >
                💡 {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <span className="text-2xl">🤖</span>
            <p className="text-xs text-gray-400 mt-2">Ask me anything about this document</p>
            <div className="mt-3 space-y-1">
              {[
                'Summarize this document',
                'What are the key points?',
                'How can I improve this?',
                'Generate a title for this',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => askQuestion(q)}
                  className="block w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-md"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
            </div>
            <span className="text-[10px] text-gray-400">Thinking...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this document..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ScoreBar({label, score}: {label: string; score: number}) {
  const color = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-20">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{width: `${score}%`}} />
      </div>
      <span className="text-[10px] text-gray-400 w-6 text-right">{score}</span>
    </div>
  );
}

function MessageBubble({message}: {message: AIAssistantMessage}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-800'
      }`}>
        {message.content}
      </div>
    </div>
  );
}
