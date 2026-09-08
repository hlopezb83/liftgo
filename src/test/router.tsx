import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

interface TestRouterProps {
  children: ReactNode;
  /** Entrada inicial del historial, ej. ["/bookings/bk-1"]. */
  initialEntries?: string[];
  /**
   * Patrón de ruta en sintaxis TanStack (`/bookings/$id`) cuando el
   * componente bajo prueba lee parámetros con `useParams`.
   */
  path?: string;
}

/**
 * Envoltorio de enrutador para pruebas. Sustituye al `MemoryRouter` de
 * react-router tras la migración a TanStack Start: monta un enrutador en
 * memoria para que los hooks de navegación (`useLocation`, `useSearchParams`,
 * `useNavigate`, `useParams`, `useBlocker`) funcionen igual que en la app.
 */
export function TestRouter({
  children,
  initialEntries = ["/"],
  path,
}: TestRouterProps) {
  const entriesKey = initialEntries.join("|");
  const router = useMemo(() => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const render = () => <>{children}</>;
    const routes = [
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: render }),
      createRoute({ getParentRoute: () => rootRoute, path: "$", component: render }),
    ];
    if (path) {
      routes.push(
        createRoute({ getParentRoute: () => rootRoute, path, component: render }),
      );
    }
    return createRouter({
      routeTree: rootRoute.addChildren(routes),
      history: createMemoryHistory({ initialEntries }),
      defaultPendingMinMs: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesKey, path, children]);

  return <RouterProvider router={router} />;
}

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
