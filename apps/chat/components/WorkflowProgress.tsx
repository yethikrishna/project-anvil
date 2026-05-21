/**
 * WorkflowProgress — visualizes multi-step tool chain execution.
 * Shows each step with status, duration, and expandable results.
 */

'use client';

import { useState } from 'react';
import { cn } from '@anvil/ui';

export interface WorkflowStepResult {
  name: string;
  success: boolean;
  result: string;
  duration: number;
}

interface Props {
  steps: WorkflowStepResult[];
  isRunning: boolean;
  currentStep?: number;
  summary?: string;
}

export default function WorkflowProgress({ steps, isRunning, currentStep, summary }: Props) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <div className="mx-4 my-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-200 dark:border-blue-800">
        <span className="text-sm">🔗</span>
        <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
          Multi-step Workflow
        </span>
        {isRunning && (
          <span className="text-[10px] text-blue-500 animate-pulse ml-auto">
            Executing step {Math.min((currentStep ?? 0) + 1, steps.length + 1)}/{steps.length + 1}...
          </span>
        )}
        {!isRunning && summary && (
          <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-auto">
            {summary}
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="divide-y divide-blue-100 dark:divide-blue-900">
        {steps.map((step, i) => (
          <div key={i}>
            <button
              onClick={() => setExpandedStep(expandedStep === i ? null : i)}
              className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors"
            >
              {/* Status icon */}
              <span className="text-xs">
                {step.success ? '✓' : isRunning && i === currentStep ? '⟳' : '✗'}
              </span>

              {/* Step name */}
              <span className={cn(
                'text-xs font-medium flex-1',
                step.success ? 'text-green-700 dark:text-green-300' :
                  isRunning && i === currentStep ? 'text-blue-600 dark:text-blue-400 animate-pulse' :
                  'text-red-600 dark:text-red-400',
              )}>
                {step.name}
              </span>

              {/* Duration */}
              <span className="text-[10px] text-gray-400">
                {step.duration}ms
              </span>

              {/* Expand indicator */}
              <span className="text-[10px] text-gray-400">
                {expandedStep === i ? '▲' : '▼'}
              </span>
            </button>

            {/* Expanded result */}
            {expandedStep === i && (
              <div className="px-4 pb-2">
                <pre className="text-[10px] font-mono bg-white dark:bg-gray-900 rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(step.result), null, 2);
                    } catch {
                      return step.result.slice(0, 500);
                    }
                  })()}
                </pre>
              </div>
            )}
          </div>
        ))}

        {/* Running indicator */}
        {isRunning && (
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="text-xs animate-pulse text-blue-500">⟳</span>
            <span className="text-xs text-blue-500 animate-pulse">
              Executing next step...
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-blue-100 dark:bg-blue-900">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${(steps.filter(s => s.success).length / (steps.length + 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
