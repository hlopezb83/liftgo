import { createContext, useContext, useEffect, useEffectEvent } from "react";

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
 * Los callbacks se invocan vía `useEffectEvent`, por lo que no es necesario
 * memoizarlos y el efecto no se re-dispara al cambiar la identidad del objeto
 * `actions` — sólo cuando cambia la etiqueta serializable `newLabel` o cuando
 * cambia el `register` (estable vía useCallback en el provider).
 */
export function usePageActions(actions: PageActions): void {
  const ctx = useContext(PageActionsContext);
  const register = ctx?.register;
  const newLabel = actions.newLabel;

  const onNew = useEffectEvent(() => actions.onNew?.());
  const onRefresh = useEffectEvent(() => actions.onRefresh?.());

  useEffect(() => {
    if (!register) return;
    return register({ newLabel, onNew, onRefresh });
    // `onNew` y `onRefresh` son useEffectEvent (estables por contrato, no deben
    // listarse). El linter aún no los detecta automáticamente en imports named.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, newLabel]);
}

