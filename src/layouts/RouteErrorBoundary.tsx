import { useLocation } from "react-router-dom";
import { type ReactNode, useMemo } from "react";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";
import { appRoutes } from "@/lib/routes-config";

interface Props {
  children: ReactNode;
}

/**
 * Boundary por ruta: si una página falla (chunk corrupto, error de render),
 * solo se reemplaza el contenido del Outlet — el sidebar y topbar permanecen.
 * Se re-monta en cada cambio de pathname para auto-resetear el estado.
 */
export function RouteErrorBoundary({ children }: Props) {
  const { pathname } = useLocation();

  const routeLabel = useMemo(() => {
    const match = appRoutes.find((r) => pathname === r.path || pathname.startsWith(r.path.split(":")[0]));
    return match?.module;
  }, [pathname]);

  return (
    <ErrorBoundary key={pathname} scope="route" routeLabel={routeLabel}>
      {children}
    </ErrorBoundary>
  );
}
