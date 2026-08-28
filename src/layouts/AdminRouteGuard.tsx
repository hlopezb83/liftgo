import { useIsRestoring } from "@tanstack/react-query";
import { useUserRole } from "@/features/users";
import { NoAccess } from "@/layouts/NoAccess";
import type { ReactNode } from "react";

interface AdminRouteGuardProps {
  module?: string;
  children: ReactNode;
}

/**
 * Restringe una ruta a usuarios con rol `admin`.
 * Se usa para rutas críticas que no deben estar disponibles ni siquiera
 * para roles con acceso al módulo (p. ej. creación directa de reservas).
 */
export function AdminRouteGuard({ module, children }: AdminRouteGuardProps) {
  const isRestoring = useIsRestoring();
  const { data: role, isLoading, isError } = useUserRole();

  // G-C6: durante la rehidratación del caché persistido las queries reportan
  // `isLoading:false` con `data:undefined`; sin esperar a `isRestoring` un admin
  // veía un parpadeo de "sin permiso" tras recargar.
  if (isRestoring || isLoading) return null;
  if (isError) return <NoAccess module={module} reason="error" />;
  if (!role) return <NoAccess module={module} reason="no-role" />;
  if (role !== "admin") return <NoAccess module={module} reason="forbidden" requiredAccess="full" />;

  return <>{children}</>;
}
