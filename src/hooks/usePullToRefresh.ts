import { useDrag } from "@use-gesture/react";
import { useCallback, useMemo, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown> | void;
  /** Elemento scrollable al que adjuntar los listeners. Si es null, hook inactivo. */
  target: HTMLElement | null;
  /** Distancia (px) que el usuario debe arrastrar para disparar refresh. */
  threshold?: number;
  /** Distancia máxima visible que la animación puede mostrar. */
  maxDistance?: number;
  /** Desactiva el comportamiento (por ejemplo, en desktop). */
  enabled?: boolean;
}

/**
 * Pull-to-refresh para contenedores con scroll vertical.
 *
 * Delegamos la detección del gesto en `useDrag` de @use-gesture/react
 * (pointer events + touch normalizados, cancelación, tap detection). Solo
 * conservamos la lógica de dominio: gate `scrollTop === 0`, curva de
 * resistencia y decisión de disparo por umbral.
 */
export function usePullToRefresh({
  onRefresh,
  target,
  threshold = 70,
  maxDistance = 110,
  enabled = true,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);

  const trigger = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh]);

  // `useDrag` requiere un ref-like con `.current`. Envolvemos el `target` en un
  // objeto memoizado con esa forma para que la lib pueda re-attach cuando cambia.
  const targetRef = useMemo(() => ({ current: target }), [target]);

  useDrag(
    ({ movement: [, my], last, canceled, first, event, cancel }) => {
      if (!enabled || !target) return;

      // Solo interceptamos si el contenedor está en el tope del scroll al iniciar.
      if (first && target.scrollTop > 0) {
        cancel();
        return;
      }
      if (target.scrollTop > 0) {
        setPullDistance(0);
        return;
      }
      if (my <= 0) {
        if (last) setPullDistance(0);
        else setPullDistance(0);
        return;
      }

      // Evitamos que el navegador dispare pull-to-refresh nativo del sistema
      // mientras el usuario esté arrastrando dentro del área.
      if (event.cancelable) event.preventDefault();

      const eased = Math.min(maxDistance, my * 0.5);

      if (last) {
        if (!canceled && eased >= threshold) {
          void trigger();
        } else {
          setPullDistance(0);
        }
        return;
      }

      setPullDistance(eased);
    },
    {
      target: targetRef,
      enabled: enabled && !!target,
      axis: "y",
      pointer: { touch: true },
      filterTaps: true,
      eventOptions: { passive: false },
    },
  );

  return { pullDistance, isRefreshing, threshold };
}
