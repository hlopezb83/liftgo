import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface PageActions {
  /** Crear nuevo registro (botón "Nuevo" de la página). */
  onNew?: () => void;
  /** Refrescar el listado principal. */
  onRefresh?: () => void;
  /** Etiqueta humana del nuevo, ej. "Nuevo cliente". */
  newLabel?: string;
}

interface PageActionsContextValue {
  actions: PageActions;
  register: (a: PageActions) => () => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<PageActions>({});

  const register = useCallback((a: PageActions) => {
    setActions(a);
    return () => {
      setActions((current) => (current === a ? {} : current));
    };
  }, []);

  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <PageActionsContext.Provider value={value}>{children}</PageActionsContext.Provider>;
}

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

  const newLabel = actions.newLabel;

  useEffect(() => {
    if (!ctx) return;
    const unregister = ctx.register({
      newLabel,
      onNew: () => ref.current.onNew?.(),
      onRefresh: () => ref.current.onRefresh?.(),
    });
    return unregister;
  }, [ctx, newLabel]);
}
