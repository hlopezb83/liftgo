import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";

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
    const entries = entriesKey.split("|");
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const render = () => <>{children}</>;
    // Los tipos de rutas de TanStack son literales por path; en pruebas
    // construimos el árbol dinámicamente, así que relajamos el tipado aquí.
    const routes: any[] = [
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: render }),
      createRoute({ getParentRoute: () => rootRoute, path: "$", component: render }),
    ];
    if (path) {
      routes.push(
        createRoute({ getParentRoute: () => rootRoute, path: path as any, component: render }),
      );
    }
    return createRouter({
      routeTree: rootRoute.addChildren(routes),
      history: createMemoryHistory({ initialEntries: entries }),
      defaultPendingMinMs: 0,
      parseSearch,
      stringifySearch,
    });
  }, [entriesKey, path, children]);

  return <RouterProvider router={router} />;
}
