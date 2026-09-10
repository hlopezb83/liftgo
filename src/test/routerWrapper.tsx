import type { ReactNode } from "react";
import { TestRouter } from "./router";

/** Wrapper listo para `renderHook`/`render` de testing-library. */
export function createRouterWrapper(initialEntries: string[] = ["/"], path?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TestRouter initialEntries={initialEntries} path={path}>
        {children}
      </TestRouter>
    );
  };
}
