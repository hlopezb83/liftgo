import { createContext, useContext, useEffect, useRef } from "react";

export interface PageActions {
  /** Crear nuevo registro (botón "Nuevo" de la página). */
  onNew?: () => void;
  /** Refrescar el listado principal. */
  onRefresh?: () => void;
  /** Etiqueta humana del nuevo, ej. "Nuevo cliente". */
  newLabel?: string;
}

export interface PageActionsContextValue {
  actions: PageActions;
  register: (a: PageActions) => () => void;
}

export const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function usePageActionsContext(): PageActionsContextValue {
  const ctx = useContext(PageActionsContext);
  if (!ctx) throw new Error("usePageActionsContext debe usarse dentro de PageActionsProvider");
  return ctx;
}

/**
 * Hook ergonómico para que una página declare sus acciones de teclado.
 * Los callbacks se llaman vía ref, por lo que no es necesario memoizarlos.
 */
export function usePageActions(actions: PageActions): void {
  const ctx = useContext(PageActionsContext);
  const ref = useRef(actions);
  ref.current = actions;

  // Sólo dependemos de `register` (estable vía useCallback) y de `newLabel`
  // (dato serializable). NO dependemos del objeto `ctx` completo: su identidad
  // cambia cada vez que `actions` se actualiza dentro del provider, lo que
  // dispararía un loop infinito de register → setState → re-render → register.
  // React 19 detecta el loop y aborta con "Maximum update depth exceeded";
  // React 18 lo toleraba silenciosamente pero congelaba interacciones.
  const register = ctx?.register;
  const newLabel = actions.newLabel;

  useEffect(() => {
    if (!register) return;
    const unregister = register({
      newLabel,
      onNew: () => ref.current.onNew?.(),
      onRefresh: () => ref.current.onRefresh?.(),
    });
    return unregister;
  }, [register, newLabel]);
}
