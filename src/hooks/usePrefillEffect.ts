import { useEffect, useRef } from "react";

/**
 * Ejecuta `effect` cuando cambian `deps`, usando siempre la versión más reciente
 * del callback (estilo `useEffectEvent`).
 *
 * Diseñado para los prefills de formularios: queremos reaccionar solamente cuando
 * llega la data fuente (existing, sourceQuote, open, etc.) sin tener que listar
 * `form` / setters estables en las deps ni esparcir disables de
 * `react-hooks/exhaustive-deps` por todo el código.
 *
 * El único disable de exhaustive-deps queda contenido aquí.
 */
export function usePrefillEffect(effect: () => void, deps: unknown[]) {
  const ref = useRef(effect);
  ref.current = effect;
  useEffect(() => {
    ref.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
