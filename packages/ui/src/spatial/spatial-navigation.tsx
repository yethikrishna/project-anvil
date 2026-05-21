'use client';

/**
 * Spatial navigation for grids and lists — keyboard-driven navigation.
 *
 * Features:
 * - Arrow key navigation in 2D grids
 * - Tab/Shift+Tab between groups
 * - Enter/Space to select
 * - Home/End for first/last item
 * - Page Up/Down for scrolling
 * - Focus management with roving tabindex
 */

import {useState, useCallback, useRef, useEffect} from 'react';

export interface SpatialNavigationOptions {
  /** Number of columns in the grid (0 = auto-detect) */
  columns?: number;
  /** Wrap to next/previous row */
  wrap?: boolean;
  /** Enable page up/down */
  pageScroll?: boolean;
}

export function useSpatialNavigation(
  itemCount: number,
  options: SpatialNavigationOptions = {}
) {
  const {columns = 0, wrap = true, pageScroll = true} = options;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const cols = columns || 1;

  const navigate = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageUp' | 'pageDown') => {
    setFocusedIndex(prev => {
      let next = prev;

      switch (direction) {
        case 'right':
          if (prev < itemCount - 1) next = prev + 1;
          else if (wrap) next = 0;
          break;
        case 'left':
          if (prev > 0) next = prev - 1;
          else if (wrap) next = itemCount - 1;
          break;
        case 'down':
          if (prev + cols < itemCount) next = prev + cols;
          else if (wrap) next = prev % cols;
          break;
        case 'up':
          if (prev - cols >= 0) next = prev - cols;
          else if (wrap) {
            const remainder = (itemCount - 1) % cols;
            next = Math.max(0, itemCount - cols + (prev % cols <= remainder ? prev % cols : remainder));
          }
          break;
        case 'home':
          next = 0;
          break;
        case 'end':
          next = itemCount - 1;
          break;
        case 'pageUp':
          next = Math.max(0, prev - cols * 3);
          break;
        case 'pageDown':
          next = Math.min(itemCount - 1, prev + cols * 3);
          break;
      }

      return next;
    });
  }, [itemCount, cols, wrap]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const keyMap: Record<string, () => void> = {
      ArrowUp: () => navigate('up'),
      ArrowDown: () => navigate('down'),
      ArrowLeft: () => navigate('left'),
      ArrowRight: () => navigate('right'),
      Home: () => navigate('home'),
      End: () => navigate('end'),
    };

    if (pageScroll) {
      keyMap.PageUp = () => navigate('pageUp');
      keyMap.PageDown = () => navigate('pageDown');
    }

    const handler = keyMap[e.key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  }, [navigate, pageScroll]);

  // Scroll focused item into view
  useEffect(() => {
    if (!containerRef.current) return;
    const focused = containerRef.current.querySelector(`[data-spatial-index="${focusedIndex}"]`);
    focused?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }, [focusedIndex]);

  return {
    focusedIndex,
    setFocusedIndex,
    containerRef,
    handleKeyDown,
    getItemProps: (index: number) => ({
      'data-spatial-index': index,
      tabIndex: index === focusedIndex ? 0 : -1,
      role: 'gridcell' as const,
      'aria-selected': index === focusedIndex,
      onFocus: () => setFocusedIndex(index),
    }),
  };
}

// ── Roving Tabindex ──

export function useRovingTabindex(items: string[]) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(items.length - 1);
        break;
    }
  }, [items.length]);

  return {
    activeIndex,
    setActiveIndex,
    handleKeyDown,
    getItemProps: (index: number) => ({
      tabIndex: index === activeIndex ? 0 : -1,
      role: 'tab' as const,
      'aria-selected': index === activeIndex,
    }),
  };
}

// ── Focus Trap (for modals/dialogs) ──

export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = container.querySelectorAll(focusableSelector);
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // Auto-focus first focusable element
    const firstFocusable = container.querySelector(focusableSelector) as HTMLElement;
    firstFocusable?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}
