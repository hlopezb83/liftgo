import { useEffect, useRef } from "react";

/**
 * Hook mínimo para secuencias de dos teclas tipo Gmail (ej. "g d").
 * Se ignoran los eventos originados en inputs, textareas o contenteditable.
 *
 * @param prefix - Primera tecla (ej. "g")
 * @param handlers - Mapa de segunda tecla → handler
 * @param timeoutMs - Ventana para completar la secuencia
 */
export function useKeySequence(
  prefix: string,
  handlers: Record<string, () => void>,
  timeoutMs = 1500,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let armed = false;
    let timer: number | null = null;

    const disarm = () => {
      armed = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) {
        disarm();
        return;
      }
      const key = e.key.toLowerCase();
      if (armed) {
        const fn = handlersRef.current[key];
        disarm();
        if (fn) {
          e.preventDefault();
          fn();
        }
        return;
      }
      if (key === prefix.toLowerCase()) {
        e.preventDefault();
        armed = true;
        timer = window.setTimeout(disarm, timeoutMs);
      }
    };

    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [prefix, timeoutMs]);
}
