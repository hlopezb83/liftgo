import { useEffect, useRef, useState, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown> | void;
  /** Distancia (px) que el usuario debe arrastrar para disparar refresh. */
  threshold?: number;
  /** Distancia máxima visible que la animación puede mostrar. */
  maxDistance?: number;
  /** Desactiva el comportamiento (por ejemplo, en desktop). */
  enabled?: boolean;
}

/**
 * Pull-to-refresh para contenedores con scroll vertical.
 * Devuelve `containerRef` para adjuntar al scroller y `pullDistance` /
 * `isRefreshing` para renderizar un indicador visual.
 *
 * Solo dispara cuando el contenedor ya está en `scrollTop === 0` para no
 * interferir con scroll natural.
 */
export function usePullToRefresh<T extends HTMLElement = HTMLElement>({
  onRefresh,
  threshold = 70,
  maxDistance = 110,
  enabled = true,
}: UsePullToRefreshOptions) {
  const containerRef = useRef<T | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const trigger = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || startYRef.current === null) return;
      if (el.scrollTop > 0) {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        setPullDistance(0);
        return;
      }
      // Resistencia para que se sienta natural
      const eased = Math.min(maxDistance, delta * 0.5);
      setPullDistance(eased);
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      startYRef.current = null;
      if (pullDistance >= threshold && !isRefreshing) {
        void trigger();
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, threshold, maxDistance, pullDistance, isRefreshing, trigger]);

  return { containerRef, pullDistance, isRefreshing, threshold };
}
