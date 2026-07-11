import { useEffect, useEffectEvent } from "react";

/**
 * Ejecuta `effect` cuando cambian `deps`, usando siempre la versión más
 * reciente del callback vía `useEffectEvent` (estable en React 19.2).
 *
 * Diseñado para los prefills de formularios: queremos reaccionar solamente
 * cuando llega la data fuente (existing, sourceQuote, open, etc.) sin tener
 * que listar `form` / setters estables en las deps.
 *
 * Convertimos `deps` a una key primitiva (`depKey`) para que `exhaustive-deps`
 * pueda validar estáticamente el efecto sin necesidad de `eslint-disable`.
 * `useEffectEvent` garantiza que `run` es estable por contrato (React docs
 * prohíben listarlo en deps y el linter lo omite automáticamente).
 */
export function usePrefillEffect(effect: () => void, deps: unknown[]) {
  const run = useEffectEvent(effect);
  const depKey = serializeDeps(deps);
  useEffect(() => {
    run();
  }, [depKey, run]);

}

function serializeDeps(deps: unknown[]): string {
  return deps
    .map((d) => {
      if (d === undefined) return "u";
      if (d === null) return "n";
      if (typeof d === "object") {
        // Objetos frecuentes en callsites: entidades con id, arrays de ids.
        if ("id" in (d as Record<string, unknown>)) return `id:${(d as { id: unknown }).id}`;
        if (Array.isArray(d)) return `[${d.map((x) => (x == null ? "" : String(x))).join(",")}]`;
        return JSON.stringify(d);
      }
      return String(d);
    })
    .join("|");
}


