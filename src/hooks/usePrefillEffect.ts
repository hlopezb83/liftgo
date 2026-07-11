import { useEffect, useEffectEvent } from "react";

/**
 * Ejecuta `effect` cuando cambian `deps`, usando siempre la versión más
 * reciente del callback vía `useEffectEvent` (estable en React 19.2).
 *
 * Diseñado para los prefills de formularios: queremos reaccionar solamente
 * cuando llega la data fuente (existing, sourceQuote, open, etc.) sin tener
 * que listar `form` / setters estables en las deps ni esparcir disables de
 * `react-hooks/exhaustive-deps` por todo el código.
 *
 * Antes usábamos un `ref.current = effect` como polyfill manual. `useEffectEvent`
 * hace exactamente eso pero integrado con el linter, así que ya no requiere
 * `eslint-disable`.
 */
export function usePrefillEffect(effect: () => void, deps: unknown[]) {
  const run = useEffectEvent(effect);
  useEffect(() => {
    run();
    // `run` es estable por contrato de useEffectEvent; sólo dependemos de `deps`.
  }, deps);
}
