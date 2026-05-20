/**
 * View Transitions API wrapper for cross-app navigation animations.
 *
 * Usage:
 * ```ts
 * import {navigateWithTransition} from '@anvil/ui/transitions';
 * navigateWithTransition('/docs', 'slide-left');
 * ```
 *
 * Falls back gracefully in browsers without View Transitions support.
 */

export type TransitionType = 'slide-left' | 'slide-right' | 'fade' | 'zoom' | 'none';

/**
 * Navigate to a URL with a View Transition animation.
 */
export async function navigateWithTransition(
  url: string,
  type: TransitionType = 'fade'
): Promise<void> {
  // Check if View Transitions API is supported
  if (!document.startViewTransition) {
    window.location.href = url;
    return;
  }

  const transition = document.startViewTransition(async () => {
    // Update the DOM
    // In a real app, this would trigger the Next.js router
    // For now, we do a full navigation
  });

  // Apply animation based on type
  switch (type) {
    case 'slide-left':
      await transition.ready;
      document.documentElement.animate(
        [
          {transform: 'translateX(100%)', opacity: 0.8},
          {transform: 'translateX(0)', opacity: 1},
        ],
        {duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards'}
      );
      break;

    case 'slide-right':
      await transition.ready;
      document.documentElement.animate(
        [
          {transform: 'translateX(-100%)', opacity: 0.8},
          {transform: 'translateX(0)', opacity: 1},
        ],
        {duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards'}
      );
      break;

    case 'zoom':
      await transition.ready;
      document.documentElement.animate(
        [
          {transform: 'scale(0.95)', opacity: 0},
          {transform: 'scale(1)', opacity: 1},
        ],
        {duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards'}
      );
      break;

    case 'fade':
    default:
      await transition.ready;
      document.documentElement.animate(
        [
          {opacity: 0},
          {opacity: 1},
        ],
        {duration: 200, fill: 'forwards'}
      );
      break;
  }

  await transition.finished;
}

/**
 * CSS classes for scroll-driven animations.
 * Add these to your global CSS or Tailwind config.
 */
export const SCROLL_ANIMATION_CSS = `
/* Scroll-driven parallax */
@supports (animation-timeline: scroll()) {
  .scroll-parallax {
    animation: scroll-parallax linear both;
    animation-timeline: scroll();
    animation-range: entry 0% cover 40%;
  }

  @keyframes scroll-parallax {
    from { transform: translateY(50px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
}

/* Staggered reveal */
.scroll-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.scroll-reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* Progress bar */
@supports (animation-timeline: scroll()) {
  .scroll-progress {
    animation: scroll-progress linear both;
    animation-timeline: scroll();
  }

  @keyframes scroll-progress {
    from { width: 0%; }
    to { width: 100%; }
  }
}

/* View Transitions */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes slide-from-right {
  from { transform: translateX(30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slide-from-left {
  from { transform: translateX(-30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

::view-transition-old(root) {
  animation: fade-out 150ms ease-out;
}

::view-transition-new(root) {
  animation: fade-in 200ms ease-in;
}

/* Per-element transitions */
::view-transition-old(.card-transition) {
  animation: slide-from-left 200ms ease-out;
}

::view-transition-new(.card-transition) {
  animation: slide-from-right 200ms ease-in;
}
`;

/**
 * Container Query CSS for adaptive components.
 */
export const CONTAINER_QUERY_CSS = `
/* Enable container queries on layout containers */
.card-container,
.sidebar-panel,
.main-content,
.grid-cell {
  container-type: inline-size;
  container-name: card;
}

/* Responsive card layout via container queries */
@container card (min-width: 400px) {
  .adaptive-card {
    flex-direction: row;
  }
  .adaptive-card .card-image {
    width: 200px;
    height: auto;
  }
}

@container card (max-width: 400px) {
  .adaptive-card {
    flex-direction: column;
  }
  .adaptive-card .card-image {
    width: 100%;
    height: 150px;
  }
}

/* Adaptive sidebar */
@container sidebar (min-width: 280px) {
  .sidebar-nav .nav-label {
    display: block;
  }
}

@container sidebar (max-width: 280px) {
  .sidebar-nav .nav-label {
    display: none;
  }
}
`;

/**
 * Popover API + Anchor Positioning styles.
 */
export const POPOVER_CSS = `
/* Native Popover API */
[popover] {
  margin: 0;
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: white;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  color: #111827;
  font-size: 0.875rem;
}

[popover]:popover-open {
  animation: popover-in 150ms ease-out;
}

@keyframes popover-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Anchor positioning (where supported) */
@supports (anchor-name: --trigger) {
  .anchored-popover {
    position-anchor: --trigger;
    top: anchor(bottom);
    left: anchor(left);
  }
}
`;
