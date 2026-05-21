'use client';

/**
 * Mobile gesture navigation for Project Anvil.
 *
 * Gestures:
 * - Swipe right: Archive (Gmail), go back (Docs/Drive)
 * - Swipe left: Delete (Gmail), next item
 * - Pinch zoom: Maps zoom, image zoom
 * - Long-press select: Multi-select in Drive, Gmail
 * - Pull-to-refresh: Reload content
 * - Two-finger rotate: Map rotation
 */

import {useState, useCallback, useRef, useEffect} from 'react';

// ── Types ──

export interface SwipeGestureState {
  direction: 'left' | 'right' | 'up' | 'down' | null;
  distance: number;
  velocity: number;
}

export interface GestureHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinchZoom?: (scale: number) => void;
  onLongPress?: () => void;
  onTap?: () => void;
}

// ── Swipe Hook ──

const SWIPE_THRESHOLD = 50; // Minimum distance for a swipe
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export function useSwipeGesture(handlers: GestureHandlers, options?: {threshold?: number}) {
  const threshold = options?.threshold ?? SWIPE_THRESHOLD;
  const startPos = useRef({x: 0, y: 0, time: 0});
  const [isSwiping, setIsSwiping] = useState(false);
  const [offsetX, setOffsetX] = useState(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startPos.current = {x: touch.clientX, y: touch.clientY, time: Date.now()};
    setIsSwiping(true);
    setOffsetX(0);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - startPos.current.x;
    setOffsetX(dx);
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startPos.current.x;
    const dy = touch.clientY - startPos.current.y;
    const dt = Date.now() - startPos.current.time;
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

    setIsSwiping(false);
    setOffsetX(0);

    if (Math.abs(dx) > threshold && velocity > SWIPE_VELOCITY_THRESHOLD) {
      if (dx > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    } else if (Math.abs(dy) > threshold && velocity > SWIPE_VELOCITY_THRESHOLD) {
      if (dy > 0) {
        handlers.onSwipeDown?.();
      } else {
        handlers.onSwipeUp?.();
      }
    }
  }, [handlers, threshold]);

  return {isSwiping, offsetX, onTouchStart, onTouchMove, onTouchEnd};
}

// ── Swipeable List Item ──

export interface SwipeableListItemProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: React.ReactNode; // Shown when swiping right
  rightAction?: React.ReactNode; // Shown when swiping left
  threshold?: number;
}

export function SwipeableListItem({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  threshold,
}: SwipeableListItemProps) {
  const {isSwiping, offsetX, onTouchStart, onTouchMove, onTouchEnd} = useSwipeGesture(
    {onSwipeLeft, onSwipeRight},
    {threshold}
  );

  const showLeft = offsetX > 40;
  const showRight = offsetX < -40;

  return (
    <div className="relative overflow-hidden">
      {/* Left action background (archive) */}
      {leftAction && (
        <div className={`absolute left-0 top-0 h-full flex items-center px-4 transition-opacity ${showLeft ? 'opacity-100' : 'opacity-0'}`}>
          {leftAction}
        </div>
      )}

      {/* Right action background (delete) */}
      {rightAction && (
        <div className={`absolute right-0 top-0 h-full flex items-center px-4 transition-opacity ${showRight ? 'opacity-100' : 'opacity-0'}`}>
          {rightAction}
        </div>
      )}

      {/* Content */}
      <div
        className="relative transition-transform bg-white dark:bg-gray-900"
        style={{
          transform: isSwiping ? `translateX(${offsetX}px)` : 'translateX(0)',
          transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

// ── Long Press Hook ──

export function useLongPress(callback: () => void, delay = 500) {
  const [isPressed, setIsPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    setIsPressed(true);
    timerRef.current = setTimeout(() => {
      callback();
      setIsPressed(false);
    }, delay);
  }, [callback, delay]);

  const cancel = useCallback(() => {
    setIsPressed(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    isPressed,
    handlers: {
      onTouchStart: start,
      onTouchEnd: cancel,
      onTouchCancel: cancel,
      onMouseDown: start,
      onMouseUp: cancel,
      onMouseLeave: cancel,
    },
  };
}

// ── Pinch Zoom Hook ──

export function usePinchZoom(onZoom: (scale: number) => void) {
  const initialDistance = useRef<number | null>(null);
  const [scale, setScale] = useState(1);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialDistance.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistance.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const newScale = distance / initialDistance.current;

      setScale(newScale);
      onZoom(newScale);
    }
  }, [onZoom]);

  const onTouchEnd = useCallback(() => {
    initialDistance.current = null;
  }, []);

  return {scale, onTouchStart, onTouchMove, onTouchEnd};
}

// ── Pull-to-Refresh Hook ──

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startPos = useRef(0);
  const PULL_THRESHOLD = 80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startPos.current = e.touches[0].clientY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0 && !isRefreshing) {
      const distance = e.touches[0].clientY - startPos.current;
      if (distance > 0) {
        setPullDistance(Math.min(distance * 0.5, 100));
      }
    }
  }, [isRefreshing]);

  const onTouchEnd = useCallback(async () => {
    if (pullDistance > PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pullDistance, isRefreshing, onRefresh]);

  return {isRefreshing, pullDistance, onTouchStart, onTouchMove, onTouchEnd};
}

// ── Multi-Select Hook ──

export function useMultiSelect<T>(items: T[], idKey: keyof T) {
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  const toggleSelect = useCallback((item: T) => {
    const id = item[idKey] as string | number;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) setSelectionMode(false);
      } else {
        next.add(id);
        setSelectionMode(true);
      }
      return next;
    });
  }, [idKey]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(i => i[idKey] as string | number)));
    setSelectionMode(true);
  }, [items, idKey]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const isSelected = useCallback((item: T) => {
    return selectedIds.has(item[idKey] as string | number);
  }, [selectedIds, idKey]);

  return {
    selectedIds,
    selectionMode,
    selectedCount: selectedIds.size,
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
  };
}
