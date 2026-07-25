import { useEffect, useRef, useState, type RefObject } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface Result {
  sentinelRef: RefObject<HTMLDivElement | null>;
  pullDistance: number;
  isRefreshing: boolean;
  threshold: number;
  ready: boolean;
  indicatorVisible: boolean;
}

/**
 * v7.226.1 · Encapsula el pull-to-refresh de ListPageLayout: localiza el `<main>`
 * scrollable en post-mount y expone las banderas listas para el indicador.
 */
export function useListPagePullToRefresh(
  isMobile: boolean,
  onRefresh: (() => Promise<unknown> | void) | undefined,
): Result {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrollTarget, setScrollTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Intencional: necesitamos localizar el <main> scrollable post-mount para
    // pasárselo a usePullToRefresh; el setState sincroniza el ref con el hook.
    if (!isMobile || !onRefresh) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync DOM ref → state, sin cascada real (mismo valor null)
      setScrollTarget(null);
      return;
    }
    setScrollTarget(sentinelRef.current?.closest("main") as HTMLElement | null);
  }, [isMobile, onRefresh]);

  const { pullDistance, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: onRefresh ?? (() => undefined),
    target: scrollTarget,
    enabled: isMobile && !!onRefresh,
  });

  return {
    sentinelRef,
    pullDistance,
    isRefreshing,
    threshold,
    ready: pullDistance >= threshold,
    indicatorVisible: !!(isMobile && onRefresh && (pullDistance > 0 || isRefreshing)),
  };
}
