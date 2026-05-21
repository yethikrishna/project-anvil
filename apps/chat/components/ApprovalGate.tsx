/**
 * ApprovalGate — renders when the AI agent needs human approval
 * before executing a high-risk action (send email, delete files, etc).
 */

'use client';

import { cn } from '@anvil/ui';

export interface ApprovalAction {
  id: string;
  type: string;
  description: string;
  risk: 'low' | 'medium' | 'high' | 'destructive';
  params: Record<string, unknown>;
}

interface Props {
  action: ApprovalAction;
  onApprove: (actionId: string, modifications?: Record<string, unknown>) => void;
  onReject: (actionId: string) => void;
}

const RISK_BADGE = {
  low: { label: 'Low Risk', color: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  medium: { label: 'Medium Risk', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
  high: { label: 'High Risk', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  destructive: { label: 'Destructive', color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
};

export default function ApprovalGate({ action, onApprove, onReject }: Props) {
  const risk = RISK_BADGE[action.risk];

  // Render params preview based on action type
  const renderParams = () => {
    switch (action.type) {
      case 'email_send':
      case 'email_save_draft':
        return (
          <div className="space-y-1 text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
            {action.params.to && <div><span className="text-gray-400">To:</span> {String(action.params.to)}</div>}
            {action.params.subject && <div><span className="text-gray-400">Subject:</span> {String(action.params.subject)}</div>}
            {action.params.body && (
              <div><span className="text-gray-400">Body:</span> <span className="whitespace-pre-wrap">{String(action.params.body).slice(0, 300)}{String(action.params.body).length > 300 ? '...' : ''}</span></div>
            )}
          </div>
        );
      case 'calendar_create_event':
        return (
          <div className="space-y-1 text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
            {action.params.title && <div><span className="text-gray-400">Title:</span> {String(action.params.title)}</div>}
            {action.params.start_time && <div><span className="text-gray-400">Start:</span> {new Date(String(action.params.start_time)).toLocaleString()}</div>}
            {action.params.end_time && <div><span className="text-gray-400">End:</span> {new Date(String(action.params.end_time)).toLocaleString()}</div>}
            {action.params.attendees && <div><span className="text-gray-400">Attendees:</span> {(action.params.attendees as string[]).join(', ')}</div>}
          </div>
        );
      case 'file_share':
        return (
          <div className="space-y-1 text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
            {action.params.file_id && <div><span className="text-gray-400">File:</span> {String(action.params.file_id)}</div>}
            <div><span className="text-gray-400">Visibility:</span> Public link</div>
          </div>
        );
      default:
        return (
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-auto max-h-32">
            {JSON.stringify(action.params, null, 2)}
          </pre>
        );
    }
  };

  return (
    <div className="mx-4 my-2 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 overflow-hidden approval-gate-enter">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 dark:border-amber-800">
        <span className="text-sm">🔐</span>
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          Approval Required
        </span>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', risk.color)}>
          {risk.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-amber-900 dark:text-amber-100">{action.description}</p>
        {renderParams()}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30">
        <button
          onClick={() => onApprove(action.id)}
          className={cn(
            'text-xs px-4 py-1.5 rounded-lg font-medium transition-colors',
            'bg-blue-600 text-white hover:bg-blue-700',
          )}
        >
          Approve
        </button>
        <button
          onClick={() => onReject(action.id)}
          className={cn(
            'text-xs px-4 py-1.5 rounded-lg font-medium transition-colors',
            'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600',
          )}
        >
          Reject
        </button>
        <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400">
          AI will not proceed without your approval
        </span>
      </div>
    </div>
  );
}
