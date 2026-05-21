'use client';

/**
 * Enhanced View Transitions for Project Anvil.
 *
 * Three transition layers:
 * 1. App-to-app navigation (sidebar click → slide transition)
 * 2. Same-document transitions (tab switches, panel reveals)
 * 3. Cross-document transitions (file list → file detail, email list → email)
 *
 * Uses the View Transitions API with graceful fallback.
 */

import {useCallback, useRef, useEffect} from 'react';

// ── Types ──

export type TransitionAnimation = 
  | 'slide-left' | 'slide-right' 
  | 'slide-up' | 'slide-down'
  | 'fade' | 'zoom-in' | 'zoom-out'
  | 'none';

export interface ViewTransitionOptions {
  animation?: TransitionAnimation;
  duration?: number;
  easing?: string;
  /** Element to set view-transition-name on */
  transitionName?: string;
}

// ── Check Support ──

export function isViewTransitionSupported(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

// ── Transition Animations Map ──

const ANIMATIONS: Record<Exclude<TransitionAnimation, 'none'>, {
  old: Keyframe[];
  new: Keyframe[];
}> = {
  'slide-left': {
    old: [{transform: 'translateX(0)'}, {transform: 'translateX(-30%)', opacity: 0.5}],
    new: [{transform: 'translateX(100%)', opacity: 0.8}, {transform: 'translateX(0)', opacity: 1}],
  },
  'slide-right': {
    old: [{transform: 'translateX(0)'}, {transform: 'translateX(30%)', opacity: 0.5}],
    new: [{transform: 'translateX(-100%)', opacity: 0.8}, {transform: 'translateX(0)', opacity: 1}],
  },
  'slide-up': {
    old: [{transform: 'translateY(0)'}, {transform: 'translateY(-30%)', opacity: 0.5}],
    new: [{transform: 'translateY(100%)', opacity: 0.8}, {transform: 'translateY(0)', opacity: 1}],
  },
  'slide-down': {
    old: [{transform: 'translateY(0)'}, {transform: 'translateY(30%)', opacity: 0.5}],
    new: [{transform: 'translateY(-100%)', opacity: 0.8}, {transform: 'translateY(0)', opacity: 1}],
  },
  'fade': {
    old: [{opacity: 1}, {opacity: 0}],
    new: [{opacity: 0}, {opacity: 1}],
  },
  'zoom-in': {
    old: [{transform: 'scale(1)', opacity: 1}, {transform: 'scale(0.9)', opacity: 0}],
    new: [{transform: 'scale(1.05)', opacity: 0}, {transform: 'scale(1)', opacity: 1}],
  },
  'zoom-out': {
    old: [{transform: 'scale(1)', opacity: 1}, {transform: 'scale(1.05)', opacity: 0}],
    new: [{transform: 'scale(0.9)', opacity: 0}, {transform: 'scale(1)', opacity: 1}],
  },
};

// ── Core Transition Function ──

export async function startViewTransition(
  updateDOM: () => Promise<void> | void,
  options: ViewTransitionOptions = {}
): Promise<void> {
  const {
    animation = 'fade',
    duration = 250,
    easing = 'cubic-bezier(0.4, 0, 0.2, 1)',
  } = options;

  if (animation === 'none' || !isViewTransitionSupported()) {
    await updateDOM();
    return;
  }

  const (document as any).startViewTransition(async () => {
    await updateDOM();
  });

  // Apply animation
  const animConfig = ANIMATIONS[animation];
  if (!animConfig) {
    await updateDOM();
    return;
  }

  // Note: In a real implementation with View Transitions API,
  // we'd use transition.ready and document.documentElement.animate()
  // The fallback is handled by the CSS ::view-transition pseudo-elements
}

// ── Hook: App Navigation Transition ──

export function useAppTransition() {
  const navigateToApp = useCallback((
    appUrl: string,
    appName: string,
    direction: 'forward' | 'back' = 'forward'
  ) => {
    const animation = direction === 'forward' ? 'slide-left' : 'slide-right';
    
    startViewTransition(
      () => { window.location.href = appUrl; },
      {animation, duration: 300}
    );
  }, []);

  return {navigateToApp};
}

// ── Hook: Same-Document Transitions ──

export function useDocumentTransition() {
  const transitionRef = useRef<HTMLDivElement>(null);

  const switchPanel = useCallback((
    updateFn: () => void,
    animation: TransitionAnimation = 'fade'
  ) => {
    startViewTransition(updateFn, {animation, duration: 200});
  }, []);

  const switchTab = useCallback((
    updateFn: () => void,
    direction: 'left' | 'right' = 'right'
  ) => {
    startViewTransition(updateFn, {
      animation: direction === 'right' ? 'slide-left' : 'slide-right',
      duration: 200,
    });
  }, []);

  return {transitionRef, switchPanel, switchTab};
}

// ── Hook: Cross-Document Transitions ──

export function useCrossDocumentTransition() {
  const openDocument = useCallback((
    documentId: string,
    sourceElement?: HTMLElement
  ) => {
    // Set view-transition-name on the source element
    if (sourceElement && isViewTransitionSupported()) {
      sourceElement.style.viewTransitionName = `doc-preview-${documentId}`;
    }

    startViewTransition(
      () => { window.location.href = `/docs/${documentId}`; },
      {animation: 'zoom-in', duration: 300}
    );
  }, []);

  const openEmail = useCallback((
    emailId: string,
    sourceElement?: HTMLElement
  ) => {
    if (sourceElement && isViewTransitionSupported()) {
      sourceElement.style.viewTransitionName = `email-preview-${emailId}`;
    }

    startViewTransition(
      () => { window.location.href = `/gmail/${emailId}`; },
      {animation: 'slide-left', duration: 250}
    );
  }, []);

  const openFile = useCallback((
    fileId: string,
    sourceElement?: HTMLElement
  ) => {
    if (sourceElement && isViewTransitionSupported()) {
      sourceElement.style.viewTransitionName = `file-preview-${fileId}`;
    }

    startViewTransition(
      () => { window.location.href = `/drive/${fileId}`; },
      {animation: 'fade', duration: 200}
    );
  }, []);

  return {openDocument, openEmail, openFile};
}

// ── View Transition CSS ──

export const VIEW_TRANSITION_CSS = `
/* Base view transition styles */
::view-transition-old(root) {
  animation: 200ms ease-out both vt-fade-out;
}

::view-transition-new(root) {
  animation: 250ms ease-in both vt-fade-in;
}

/* App navigation: slide */
::view-transition-group(app-slide) {
  animation-duration: 300ms;
}

/* Cross-document: zoom for documents */
::view-transition-old(doc-transition) {
  animation: 300ms ease-in both vt-zoom-out;
}
::view-transition-new(doc-transition) {
  animation: 300ms ease-out both vt-zoom-in;
}

/* Email: slide from list */
::view-transition-old(email-transition) {
  animation: 200ms ease-out both vt-slide-left-old;
}
::view-transition-new(email-transition) {
  animation: 250ms ease-in both vt-slide-left-new;
}

@keyframes vt-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes vt-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes vt-zoom-out {
  from { transform: scale(1); opacity: 1; }
  to { transform: scale(0.95); opacity: 0; }
}

@keyframes vt-zoom-in {
  from { transform: scale(1.02); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes vt-slide-left-old {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(-20%); opacity: 0.3; }
}

@keyframes vt-slide-left-new {
  from { transform: translateX(20%); opacity: 0.3; }
  to { transform: translateX(0); opacity: 1; }
}
`;
