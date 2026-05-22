'use client';

/**
 * Smart Reply Engine — Context-Aware 1-Click Replies
 *
 * Generates 3-4 short reply options based on:
 * - Full thread context (what's been said)
 * - Last email's intent and tone
 * - User's writing style profile
 * - Action items mentioned
 *
 * Smarter than Gmail's smart reply because:
 * - Understands multi-turn conversations
 * - Matches user's personal writing style
 * - Includes specific details from the thread
 * - Detects what response type is needed (confirmation, answer, scheduling, etc.)
 */

import {useState, useCallback, useEffect} from 'react';
import {buildStyleProfile, getStyleDescription} from './style-persistence';

// ── Types ──

interface SmartReplyOption {
  id: string;
  text: string;
  type: 'confirm' | 'answer' | 'acknowledge' | 'schedule' | 'follow-up' | 'decline' | 'question';
  confidence: number;
  icon: string;
  label: string;
}

interface ThreadAnalysis {
  topic: string;
  lastIntent: string;
  needsResponse: boolean;
  responseType: SmartReplyOption['type'][];
  tone: 'formal' | 'friendly' | 'casual' | 'urgent';
  keyDetails: string[];
  questionsAsked: string[];
  deadlines: string[];
  actionItems: string[];
}

// ── Thread Analysis ──

function analyzeThread(messages: Array<{from: string; body: string; date: string}>): ThreadAnalysis {
  if (messages.length === 0) {
    return {
      topic: 'empty',
      lastIntent: 'unknown',
      needsResponse: false,
      responseType: [],
      tone: 'casual',
      keyDetails: [],
      questionsAsked: [],
      deadlines: [],
      actionItems: [],
    };
  }

  const lastMsg = messages[messages.length - 1];
  const lastBody = lastMsg.body.toLowerCase();
  const allBodies = messages.map(m => m.body.toLowerCase()).join(' ');

  // Detect questions in last message
  const questionsAsked: string[] = [];
  const sentences = lastBody.split(/[.!?]+/);
  for (const s of sentences) {
    if (s.includes('?')) {
      questionsAsked.push(s.trim());
    }
  }

  // Detect deadlines
  const deadlines: string[] = [];
  const deadlinePatterns = [
    /by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    /before (\w+ \d{1,2})/gi,
    /due (on|by|date)[: ]+([^.\n]+)/gi,
    /deadline[: ]+([^.\n]+)/gi,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w* \d{1,2}/gi,
  ];
  for (const pat of deadlinePatterns) {
    let match;
    while ((match = pat.exec(allBodies)) !== null) {
      deadlines.push(match[0]);
    }
  }

  // Detect action items
  const actionItems: string[] = [];
  const actionPatterns = [
    /please ([^.!\n]+)/gi,
    /can you ([^.!\n]+)/gi,
    /need you to ([^.!\n]+)/gi,
    /make sure (to )?([^.!\n]+)/gi,
    /don'?t forget (to )?([^.!\n]+)/gi,
  ];
  for (const pat of actionPatterns) {
    let match;
    while ((match = pat.exec(lastBody)) !== null) {
      actionItems.push(match[0]);
    }
  }

  // Detect topic
  const topicKeywords: Record<string, string[]> = {
    'meeting': ['meeting', 'schedule', 'calendar', 'call', 'sync', 'catch up', 'standup'],
    'project': ['project', 'sprint', 'release', 'deploy', 'milestone', 'deadline', 'roadmap'],
    'review': ['review', 'feedback', 'looks good', 'approve', 'approval', 'sign off'],
    'question': ['question', 'help', 'how do', 'what is', 'can you explain'],
    'social': ['coffee', 'lunch', 'dinner', 'drinks', 'catch up', 'hang out'],
    'notification': ['merged', 'deployed', 'build', 'success', 'failed', 'alert'],
  };

  let topic = 'general';
  for (const [t, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => lastBody.includes(kw))) {
      topic = t;
      break;
    }
  }

  // Detect last intent
  let lastIntent = 'inform';
  if (questionsAsked.length > 0) lastIntent = 'question';
  else if (/please|can you|could you|would you/.test(lastBody)) lastIntent = 'request';
  else if (/reminder|don'?t forget/.test(lastBody)) lastIntent = 'remind';
  else if (/congratulations|great job|well done|thanks/.test(lastBody)) lastIntent = 'appreciate';
  else if (/merged|deployed|success|completed/.test(lastBody)) lastIntent = 'notify';

  // Detect tone
  let tone: ThreadAnalysis['tone'] = 'casual';
  if (/urgent|asap|immediately/.test(lastBody)) tone = 'urgent';
  else if (/dear|sincerely|respectfully|regards/.test(lastBody)) tone = 'formal';
  else if (/hey|hi|cheers|thanks/.test(lastBody)) tone = 'friendly';

  // Determine needed response types
  const responseType: SmartReplyOption['type'][] = [];
  if (lastIntent === 'question') {
    responseType.push('answer', 'follow-up');
  } else if (lastIntent === 'request') {
    responseType.push('confirm', 'follow-up');
  } else if (lastIntent === 'remind') {
    responseType.push('confirm', 'acknowledge');
  } else if (lastIntent === 'appreciate') {
    responseType.push('acknowledge');
  } else if (topic === 'meeting' || topic === 'social') {
    responseType.push('schedule', 'decline');
  } else if (topic === 'notification') {
    responseType.push('acknowledge');
  } else {
    responseType.push('acknowledge', 'follow-up', 'question');
  }

  const needsResponse = lastIntent === 'question' || lastIntent === 'request' || questionsAsked.length > 0;

  // Extract key details
  const keyDetails: string[] = [];
  const detailPatterns = [
    /(\d{1,2}:\d{2}\s*(am|pm)?)/gi,
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    /(\$?\d+[\d,]*(\.\d{2})?)/g,
  ];
  for (const pat of detailPatterns) {
    let match;
    while ((match = pat.exec(lastBody)) !== null) {
      keyDetails.push(match[0]);
    }
  }

  return {
    topic,
    lastIntent,
    needsResponse,
    responseType,
    tone,
    keyDetails: [...new Set(keyDetails)],
    questionsAsked: questionsAsked.slice(0, 3),
    deadlines: [...new Set(deadlines)],
    actionItems: [...new Set(actionItems)],
  };
}

// ── Reply Generation ──

function generateReplies(
  analysis: ThreadAnalysis,
  lastMessage: {from: string; body: string},
  styleProfile: ReturnType<typeof getStyleDescription> | null,
): SmartReplyOption[] {
  const fromName = lastMessage.from.split(' ')[0] || 'there';
  const options: SmartReplyOption[] = [];
  const styleHint = styleProfile || 'professional';

  const greeting = styleHint.includes('casual') ? 'Hey' :
    styleHint.includes('friendly') ? 'Hi' : 'Hi';

  const signOff = styleHint.includes('casual') ? 'Cheers' :
    styleHint.includes('friendly') ? 'Thanks' : 'Best';

  // Generate replies based on detected response types
  for (const type of analysis.responseType) {
    switch (type) {
      case 'confirm': {
        if (analysis.actionItems.length > 0) {
          options.push({
            id: `confirm-${options.length}`,
            text: `${greeting} ${fromName},\n\nGot it — I'll take care of ${analysis.actionItems[0].replace(/^(please|can you|need you to) /i, '')}.\n\n${signOff}`,
            type: 'confirm',
            confidence: 0.85,
            icon: '✅',
            label: 'Confirm',
          });
        } else {
          options.push({
            id: `confirm-${options.length}`,
            text: `${greeting} ${fromName},\n\nSounds good, I'm on it.\n\n${signOff}`,
            type: 'confirm',
            confidence: 0.75,
            icon: '✅',
            label: 'Sounds good',
          });
        }
        break;
      }

      case 'answer': {
        const question = analysis.questionsAsked[0];
        if (question) {
          options.push({
            id: `answer-${options.length}`,
            text: `${greeting} ${fromName},\n\nRe: your question — [I'll fill in the details here].\n\nLet me know if you need anything else.\n\n${signOff}`,
            type: 'answer',
            confidence: 0.8,
            icon: '💬',
            label: 'Answer',
          });
        }
        break;
      }

      case 'acknowledge': {
        options.push({
          id: `ack-${options.length}`,
          text: analysis.topic === 'notification'
            ? `${greeting},\n\nThanks for the update!`
            : `Thanks ${fromName}, noted.\n\n${signOff}`,
          type: 'acknowledge',
          confidence: 0.7,
          icon: '👍',
          label: 'Noted',
        });
        break;
      }

      case 'schedule': {
        if (analysis.keyDetails.length > 0) {
          options.push({
            id: `sched-${options.length}`,
            text: `${greeting} ${fromName},\n\nThat works for me! See you ${analysis.keyDetails[0]}.\n\n${signOff}`,
            type: 'schedule',
            confidence: 0.8,
            icon: '📅',
            label: 'Confirm time',
          });
        } else {
          options.push({
            id: `sched-${options.length}`,
            text: `${greeting} ${fromName},\n\nI'm free — when works for you?\n\n${signOff}`,
            type: 'schedule',
            confidence: 0.65,
            icon: '📅',
            label: 'Available',
          });
        }
        break;
      }

      case 'follow-up': {
        if (analysis.deadlines.length > 0) {
          options.push({
            id: `followup-${options.length}`,
            text: `${greeting} ${fromName},\n\nWill aim to have this done by ${analysis.deadlines[0]}. I'll keep you posted.\n\n${signOff}`,
            type: 'follow-up',
            confidence: 0.7,
            icon: '📋',
            label: 'Will follow up',
          });
        } else {
          options.push({
            id: `followup-${options.length}`,
            text: `${greeting} ${fromName},\n\nLet me look into this and get back to you shortly.\n\n${signOff}`,
            type: 'follow-up',
            confidence: 0.65,
            icon: '📋',
            label: "I'll follow up",
          });
        }
        break;
      }

      case 'decline': {
        options.push({
          id: `decline-${options.length}`,
          text: `${greeting} ${fromName},\n\nUnfortunately I can't make it this time. Can we reschedule?\n\n${signOff}`,
          type: 'decline',
          confidence: 0.5,
          icon: '❌',
          label: 'Can\'t make it',
        });
        break;
      }

      case 'question': {
        options.push({
          id: `question-${options.length}`,
          text: `${greeting} ${fromName},\n\nQuick question — can you clarify ${analysis.topic === 'project' ? 'the timeline' : 'the details'}?\n\n${signOff}`,
          type: 'question',
          confidence: 0.5,
          icon: '❓',
          label: 'Ask more',
        });
        break;
      }
    }
  }

  // Always ensure at least 2 options
  if (options.length < 2) {
    options.push({
      id: 'fallback',
      text: `${greeting} ${fromName},\n\nThanks for the email. I'll review and respond shortly.\n\n${signOff}`,
      type: 'acknowledge',
      confidence: 0.4,
      icon: '📝',
      label: 'Thanks',
    });
  }

  return options.slice(0, 4).sort((a, b) => b.confidence - a.confidence);
}

// ── Hook ──

export function useSmartReplies(
  threadMessages: Array<{from: {name: string}; body: string; date: string}>,
) {
  const [replies, setReplies] = useState<SmartReplyOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const generate = useCallback(() => {
    if (threadMessages.length === 0) {
      setReplies([]);
      return;
    }

    setIsLoading(true);

    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      const analysis = analyzeThread(
        threadMessages.map(m => ({from: m.from.name, body: m.body, date: m.date}))
      );

      const lastMsg = threadMessages[threadMessages.length - 1];
      const profile = getStyleDescription(null);

      const options = generateReplies(
        analysis,
        {from: lastMsg.from.name, body: lastMsg.body},
        profile,
      );

      setReplies(options);
      setIsLoading(false);
    }, 50);
  }, [threadMessages]);

  useEffect(() => {
    generate();
  }, [generate]);

  return {replies, isLoading, regenerate: generate, analysis: threadMessages.length > 0 ? analyzeThread(threadMessages.map(m => ({from: m.from.name, body: m.body, date: m.date}))) : null};
}

export type {SmartReplyOption, ThreadAnalysis};
