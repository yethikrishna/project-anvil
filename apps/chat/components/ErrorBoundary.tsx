/**
 * ErrorBoundary — catches React render errors gracefully.
 *
 * Shows a user-friendly error card with retry button.
 * Logs errors for debugging.
 */

'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[200px] p-8">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center text-xl mx-auto mb-4">
              ⚠️
            </div>
            <h3 className="text-sm font-semibold mb-2">Something went wrong</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleRetry}
              className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
