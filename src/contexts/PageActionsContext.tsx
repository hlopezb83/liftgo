import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { PageActionsContext, type PageActions } from "./pageActions";

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<PageActions>({});

  // Pila de registrantes: al desmontar la página saliente se restauran las
  // acciones del registrante anterior en vez de quedar siempre en vacío
  // (antes el cleanup pisaba cualquier estado con `{}`).
  const stackRef = useRef<PageActions[]>([]);

  const register = useCallback((a: PageActions) => {
    stackRef.current.push(a);
    setActions(a);
    return () => {
      const idx = stackRef.current.lastIndexOf(a);
      if (idx !== -1) stackRef.current.splice(idx, 1);
      const stack = stackRef.current;
      setActions(stack.length > 0 ? stack[stack.length - 1] : {});
    };
  }, []);

  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <PageActionsContext value={value}>{children}</PageActionsContext>;
}
