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
  const { data: role, isLoading, isError } = useUserRole();

  if (isLoading) return null;
  if (isError) return <NoAccess module={module} reason="error" />;
  if (!role) return <NoAccess module={module} reason="no-role" />;
  if (role !== "admin") return <NoAccess module={module} reason="forbidden" requiredAccess="full" />;

  return <>{children}</>;
}
