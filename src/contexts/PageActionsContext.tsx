import { useCallback, useMemo, useState, type ReactNode } from "react";
import { PageActionsContext, type PageActions } from "./pageActions";

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
