import { useEffect, useRef } from "react";

/**
 * Devuelve true si el foco está en un control editable, donde no
 * debemos disparar atajos de una sola tecla.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface HotkeyHandlers {
  /** Combos con modificadores. Claves: "mod+k", "mod+shift+n", "?" */
  combos?: Record<string, (e: KeyboardEvent) => void>;
  /** Secuencias tipo Gmail. Ej: { g: { d: () => ..., c: () => ... } } */
  sequences?: Record<string, Record<string, (e: KeyboardEvent) => void>>;
  /** Teclas sueltas que solo disparan fuera de inputs. Ej: { "/": fn, "n": fn } */
  singles?: Record<string, (e: KeyboardEvent) => void>;
}

const SEQUENCE_TIMEOUT_MS = 1500;

function comboKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const k = e.key.toLowerCase();
  // Evitar duplicar modificadores como "tecla"
  if (k !== "control" && k !== "meta" && k !== "shift" && k !== "alt") parts.push(k);
  return parts.join("+");
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let pendingPrefix: string | null = null;
    let timer: number | null = null;

    const clearPending = () => {
      pendingPrefix = null;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const handler = (e: KeyboardEvent) => {
      const { combos = {}, sequences = {}, singles = {} } = handlersRef.current;
      const editable = isEditableTarget(e.target);
      const key = e.key;
      const lower = key.toLowerCase();

      // 1) Combos con modificadores (siempre activos)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        const ck = comboKey(e);
        const fn = combos[ck];
        if (fn) {
          e.preventDefault();
          clearPending();
          fn(e);
          return;
        }
      }

      // Atajos de tecla sola: no disparar dentro de inputs
      if (editable) {
        clearPending();
        return;
      }

      // 2) Secuencias (segunda tecla pendiente)
      if (pendingPrefix && sequences[pendingPrefix]?.[lower]) {
        e.preventDefault();
        const fn = sequences[pendingPrefix][lower];
        clearPending();
        fn(e);
        return;
      }

      // 3) Iniciar nueva secuencia si la tecla es prefijo conocido
      if (sequences[lower]) {
        e.preventDefault();
        pendingPrefix = lower;
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          pendingPrefix = null;
          timer = null;
        }, SEQUENCE_TIMEOUT_MS);
        return;
      }

      // 4) Combos sin modificador especiales (ej. "?")
      if (combos[lower]) {
        e.preventDefault();
        clearPending();
        combos[lower](e);
        return;
      }

      // 5) Singles
      if (singles[lower]) {
        e.preventDefault();
        clearPending();
        singles[lower](e);
        return;
      }

      // Tecla no reconocida: limpiar prefijo
      clearPending();
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
