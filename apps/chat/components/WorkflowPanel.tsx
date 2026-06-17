'use client';

/**
 * WorkflowPanel — AI Workflow Launcher
 *
 * Shows available built-in workflows, lets users launch them,
 * and streams progress in real-time with step-by-step visualization.
 *
 * Feels like having a team of specialists executing in parallel.
 */

import { useState, useRef, useCallback } from 'react';
import {
  MailCheck, Briefcase, BarChart3, CalendarClock,
  Play, X, ChevronDown, ChevronUp, CheckCircle2,
  AlertCircle, Clock, Loader2, Zap, ArrowRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────

interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  tags: string[];
  estimatedDuration: number;
  stepCount: number;
}

interface WorkflowEvent {
  type: string;
  workflowRunId?: string;
  stepId?: string;
  stepName?: string;
  message?: string;
  data?: unknown;
  progress?: number;
  timestamp: number;
}

interface WorkflowInput {
  topic?: string;
  maxEmails?: number;
  autoArchive?: boolean;
  weekOffset?: number;
  meetingTitle?: string;
}

// ── Icon map ───────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  MailCheck: <MailCheck size={20} />,
  Briefcase: <Briefcase size={20} />,
  BarChart3: <BarChart3 size={20} />,
  CalendarClock: <CalendarClock size={20} />,
};

// ── Workflow Card ──────────────────────────────────────

function WorkflowCard({
  workflow,
  onLaunch,
  disabled,
}: {
  workflow: WorkflowMeta;
  onLaunch: (id: string) => void;
  disabled: boolean;
}) {
  const tagColors: Record<string, string> = {
    email: 'bg-blue-500/20 text-blue-300',
    calendar: 'bg-green-500/20 text-green-300',
    drive: 'bg-yellow-500/20 text-yellow-300',
    docs: 'bg-purple-500/20 text-purple-300',
    productivity: 'bg-orange-500/20 text-orange-300',
    research: 'bg-pink-500/20 text-pink-300',
    report: 'bg-cyan-500/20 text-cyan-300',
    meeting: 'bg-teal-500/20 text-teal-300',
    triage: 'bg-red-500/20 text-red-300',
  };

  return (
    <div className="group relative rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/8 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300">
            {ICONS[workflow.icon] ?? <Zap size={18} />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{workflow.name}</h3>
            <p className="text-xs text-white/50 mt-0.5 line-clamp-2">{workflow.description}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {workflow.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tagColors[tag] ?? 'bg-white/10 text-white/50'}`}
                >
                  {tag}
                </span>
              ))}
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <Clock size={10} />
                ~{workflow.estimatedDuration}s
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => onLaunch(workflow.id)}
          disabled={disabled}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
        >
          <Play size={12} />
          Run
        </button>
      </div>
    </div>
  );
}

// ── Step Status Icon ───────────────────────────────────

function StepIcon({ status }: { status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' }) {
  if (status === 'running') return <Loader2 size={14} className="text-indigo-400 animate-spin" />;
  if (status === 'done') return <CheckCircle2 size={14} className="text-green-400" />;
  if (status === 'failed') return <AlertCircle size={14} className="text-red-400" />;
  if (status === 'skipped') return <ArrowRight size={14} className="text-white/30" />;
  return <div className="w-3.5 h-3.5 rounded-full border border-white/20" />;
}

// ── Active Run View ────────────────────────────────────

function ActiveRunView({
  workflowName,
  events,
  progress,
  isComplete,
  isFailed,
  output,
  onClose,
}: {
  workflowName: string;
  events: WorkflowEvent[];
  progress: number;
  isComplete: boolean;
  isFailed: boolean;
  output: string | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const stepStates = new Map<string, 'pending' | 'running' | 'done' | 'failed'>();
  const stepNames = new Map<string, string>();

  for (const evt of events) {
    if (!evt.stepId) continue;
    if (evt.stepName) stepNames.set(evt.stepId, evt.stepName);
    if (evt.type === 'step_start') stepStates.set(evt.stepId, 'running');
    else if (evt.type === 'step_complete') stepStates.set(evt.stepId, 'done');
    else if (evt.type === 'step_failed') stepStates.set(evt.stepId, 'failed');
  }

  const steps = Array.from(stepStates.entries());

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-900/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 size={16} className="text-green-400" />
          ) : isFailed ? (
            <AlertCircle size={16} className="text-red-400" />
          ) : (
            <Loader2 size={16} className="text-indigo-400 animate-spin" />
          )}
          <span className="text-sm font-semibold text-white">{workflowName}</span>
          {!isComplete && !isFailed && (
            <span className="text-xs text-white/50">{progress}%</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {(isComplete || isFailed) && (
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!isComplete && !isFailed && (
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Steps */}
      {expanded && steps.length > 0 && (
        <div className="px-4 py-3 space-y-1.5">
          {steps.map(([stepId, stepStatus]) => (
            <div key={stepId} className="flex items-center gap-2">
              <StepIcon status={stepStatus} />
              <span className={`text-xs ${stepStatus === 'running' ? 'text-white' : stepStatus === 'done' ? 'text-white/60' : 'text-white/40'}`}>
                {stepNames.get(stepId) ?? stepId}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Output */}
      {isComplete && output && (
        <div className="px-4 py-3 border-t border-white/10">
          <div className="text-xs text-white/80 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
            {output.length > 1500 ? output.slice(0, 1500) + '\n\n…[truncated]' : output}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Input Collector ────────────────────────────────────

function WorkflowInputModal({
  workflowId,
  onConfirm,
  onCancel,
}: {
  workflowId: string;
  onConfirm: (inputs: WorkflowInput) => void;
  onCancel: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [maxEmails, setMaxEmails] = useState(50);

  if (workflowId === 'deal_room') {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Deal Room — Enter Topic</h3>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Project name, client, deal, or topic…"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-500/50"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && topic.trim() && onConfirm({ topic: topic.trim() })}
        />
        <div className="flex gap-2">
          <button
            onClick={() => topic.trim() && onConfirm({ topic: topic.trim() })}
            disabled={!topic.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Search & Synthesize
          </button>
          <button onClick={onCancel} className="px-3 text-white/50 hover:text-white/70 text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (workflowId === 'inbox_zero') {
    return (
      <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Inbox Zero — Configure</h3>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Max emails to process</label>
          <input
            type="number"
            value={maxEmails}
            onChange={(e) => setMaxEmails(Number(e.target.value))}
            min={10}
            max={200}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm({ maxEmails, autoArchive: true })}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Start Triage
          </button>
          <button onClick={onCancel} className="px-3 text-white/50 hover:text-white/70 text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Default: no special inputs needed
  onConfirm({});
  return null;
}

// ── Main Component ─────────────────────────────────────

export interface WorkflowPanelProps {
  userId?: string;
  onResult?: (workflowId: string, output: string) => void;
  className?: string;
}

export default function WorkflowPanel({ userId, onResult, className }: WorkflowPanelProps) {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([
    {
      id: 'inbox_zero',
      name: 'Inbox Zero',
      description: 'Categorize all unread emails, surface what needs action, archive the rest, and draft replies.',
      icon: 'MailCheck',
      tags: ['email', 'triage', 'productivity'],
      estimatedDuration: 45,
      stepCount: 5,
    },
    {
      id: 'deal_room',
      name: 'Deal Room',
      description: 'Find every email, meeting, and doc about a project — then synthesize a comprehensive briefing.',
      icon: 'Briefcase',
      tags: ['research', 'email', 'drive', 'calendar'],
      estimatedDuration: 60,
      stepCount: 3,
    },
    {
      id: 'weekly_brief',
      name: 'Weekly Brief',
      description: 'Aggregate your week\'s activity into an AI-generated intelligence brief.',
      icon: 'BarChart3',
      tags: ['report', 'email', 'calendar'],
      estimatedDuration: 90,
      stepCount: 5,
    },
    {
      id: 'meeting_prep',
      name: 'Meeting Prep',
      description: 'Auto-prep for your next meeting: context, open items, suggested agenda.',
      icon: 'CalendarClock',
      tags: ['meeting', 'calendar', 'email'],
      estimatedDuration: 30,
      stepCount: 3,
    },
  ]);

  const [pendingWorkflow, setPendingWorkflow] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<{
    workflowId: string;
    workflowName: string;
    events: WorkflowEvent[];
    progress: number;
    isComplete: boolean;
    isFailed: boolean;
    output: string | null;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const launchWorkflow = useCallback(async (workflowId: string, inputs: WorkflowInput) => {
    const meta = workflows.find((w) => w.id === workflowId);
    if (!meta) return;

    // Cancel any ongoing run
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setActiveRun({
      workflowId,
      workflowName: meta.name,
      events: [],
      progress: 0,
      isComplete: false,
      isFailed: false,
      output: null,
    });

    try {
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, inputs, userId }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        setActiveRun((prev) => prev ? { ...prev, isFailed: true, output: 'Failed to start workflow' } : null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6)) as WorkflowEvent;

            setActiveRun((prev) => {
              if (!prev) return null;
              const isComplete = event.type === 'workflow_complete';
              const isFailed = event.type === 'workflow_failed';
              const output = isComplete && event.data
                ? typeof event.data === 'string'
                  ? event.data
                  : JSON.stringify(event.data, null, 2)
                : prev.output;

              // Notify parent on completion
              if (isComplete && output) {
                onResult?.(workflowId, output);
              }

              return {
                ...prev,
                events: [...prev.events, event],
                progress: event.progress ?? prev.progress,
                isComplete,
                isFailed: isFailed || prev.isFailed,
                output,
              };
            });
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setActiveRun((prev) => prev ? { ...prev, isFailed: true, output: 'Connection error' } : null);
    }
  }, [workflows, userId, onResult]);

  const handleLaunch = (workflowId: string) => {
    // Workflows that need inputs get a modal; others launch immediately
    if (workflowId === 'deal_room' || workflowId === 'inbox_zero') {
      setPendingWorkflow(workflowId);
    } else {
      launchWorkflow(workflowId, {});
    }
  };

  const isRunning = activeRun !== null && !activeRun.isComplete && !activeRun.isFailed;

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Zap size={14} className="text-indigo-400" />
        <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">AI Workflows</span>
      </div>

      {/* Input modal */}
      {pendingWorkflow && (
        <WorkflowInputModal
          workflowId={pendingWorkflow}
          onConfirm={(inputs) => {
            const id = pendingWorkflow;
            setPendingWorkflow(null);
            launchWorkflow(id, inputs);
          }}
          onCancel={() => setPendingWorkflow(null)}
        />
      )}

      {/* Active run */}
      {activeRun && (
        <ActiveRunView
          workflowName={activeRun.workflowName}
          events={activeRun.events}
          progress={activeRun.progress}
          isComplete={activeRun.isComplete}
          isFailed={activeRun.isFailed}
          output={activeRun.output}
          onClose={() => setActiveRun(null)}
        />
      )}

      {/* Workflow cards (hide when a run is active) */}
      {!activeRun && (
        <div className="space-y-2">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onLaunch={handleLaunch}
              disabled={isRunning}
            />
          ))}
        </div>
      )}

      {/* Show workflow list again after completion */}
      {activeRun?.isComplete && (
        <button
          onClick={() => setActiveRun(null)}
          className="w-full text-xs text-white/40 hover:text-white/60 py-2 transition-colors"
        >
          ← Back to workflows
        </button>
      )}
    </div>
  );
}
