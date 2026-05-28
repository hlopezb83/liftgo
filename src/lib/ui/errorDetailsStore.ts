import { useSyncExternalStore } from "react";
import type { ErrorReport } from "@/lib/ui/errorReport";

/**
 * Store global para el diálogo de detalles de error. Usa `useSyncExternalStore`
 * para evitar Context y prevenir re-renders globales — cualquier toast puede
 * abrir el mismo diálogo sin acoplamiento al árbol de providers.
 */
type Listener = () => void;

interface State {
  open: boolean;
  report: ErrorReport | null;
}

let state: State = { open: false, report: null };
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): State {
  return state;
}

export function openErrorReport(report: ErrorReport): void {
  state = { open: true, report };
  emit();
}

export function closeErrorReport(): void {
  if (!state.open) return;
  state = { open: false, report: state.report };
  emit();
}

export function useErrorReport(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
