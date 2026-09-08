import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

/**
 * Envoltorio de enrutador para pruebas. Sustituye al `MemoryRouter` de
 * react-router tras la migración a TanStack Start: monta un enrutador en
 * memoria con una ruta comodín para que los hooks de navegación
 * (`useLocation`, `useSearchParams`, `useNavigate`, `useBlocker`) funcionen
 * igual que en la app.
 */
export function TestRouter({
  children,
  initialEntries = ["/"],
}: {
  children: ReactNode;
  initialEntries?: string[];
}) {
  const router = useMemo(() => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const splatRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "$",
      component: () => <>{children}</>,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <>{children}</>,
    });
    return createRouter({
      routeTree: rootRoute.addChildren([indexRoute, splatRoute]),
      history: createMemoryHistory({ initialEntries }),
      defaultPendingMinMs: 0,
    });
    // Se recrea sólo si cambian las entradas iniciales; `children` se lee por
    // closure en cada render del componente de ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEntries.join("|"), children]);

  return <RouterProvider router={router} />;
}

/** Wrapper listo para `renderHook`/`render` de testing-library. */
export function createRouterWrapper(initialEntries: string[] = ["/"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <TestRouter initialEntries={initialEntries}>{children}</TestRouter>;
  };
}
