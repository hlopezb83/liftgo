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

    const tryCombo = (e: KeyboardEvent, combos: Record<string, (e: KeyboardEvent) => void>) => {
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return false;
      const fn = combos[comboKey(e)];
      if (!fn) return false;
      e.preventDefault();
      clearPending();
      fn(e);
      return true;
    };

    const trySequenceContinuation = (e: KeyboardEvent, sequences: HotkeyHandlers["sequences"], lower: string) => {
      if (!pendingPrefix || !sequences?.[pendingPrefix]?.[lower]) return false;
      e.preventDefault();
      const fn = sequences[pendingPrefix][lower];
      clearPending();
      fn(e);
      return true;
    };

    const trySequenceStart = (e: KeyboardEvent, sequences: HotkeyHandlers["sequences"], lower: string) => {
      if (!sequences?.[lower]) return false;
      e.preventDefault();
      pendingPrefix = lower;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { pendingPrefix = null; timer = null; }, SEQUENCE_TIMEOUT_MS);
      return true;
    };

    const trySingleKey = (e: KeyboardEvent, table: Record<string, (e: KeyboardEvent) => void>, lower: string) => {
      const fn = table[lower];
      if (!fn) return false;
      e.preventDefault();
      clearPending();
      fn(e);
      return true;
    };

    const handler = (e: KeyboardEvent) => {
      const { combos = {}, sequences = {}, singles = {} } = handlersRef.current;
      const lower = e.key.toLowerCase();
      if (tryCombo(e, combos)) return;
      if (isEditableTarget(e.target)) { clearPending(); return; }
      if (trySequenceContinuation(e, sequences, lower)) return;
      if (trySequenceStart(e, sequences, lower)) return;
      if (trySingleKey(e, combos, lower)) return;
      if (trySingleKey(e, singles, lower)) return;
      clearPending();
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
