import { getAccessLevel, type AccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { NoAccess } from "@/layouts/NoAccess";
import type { ReactNode } from "react";

interface RoleGuardProps {
  module?: string;
  minAccess?: AccessLevel;
  children: ReactNode;
  fallback?: ReactNode;
}

const ACCESS_HIERARCHY: AccessLevel[] = ["none", "read", "full"];

function hasSufficientAccess(level: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_HIERARCHY.indexOf(level) >= ACCESS_HIERARCHY.indexOf(required);
}

function resolveGuardReason(args: {
  loading: boolean;
  error: boolean;
  role: string | null | undefined;
}): "loading" | "error" | "no-role" | "ok" {
  if (args.loading) return "loading";
  if (args.error) return "error";
  if (!args.role) return "no-role";
  return "ok";
}

function renderFallback(fallback: ReactNode | undefined, node: ReactNode) {
  // R6-B1: distinguir explícitamente `undefined` (usar NoAccess por defecto)
  // vs `null` u otro ReactNode (usar el fallback tal cual, incluido null → nada).
  return <>{fallback === undefined ? node : fallback}</>;
}

export function RoleGuard({ module, minAccess = "read", children, fallback }: RoleGuardProps) {
  const { data: role, isLoading: roleLoading, isError: roleError } = useUserRole();
  const { data: perms, isLoading: permsLoading, isError: permsError } = useRolePermissions();

  const loading = roleLoading || permsLoading;
  const error = roleError || permsError;
  const reason = resolveGuardReason({ loading, error, role });

  if (reason === "loading") return null;
  if (reason === "error") return renderFallback(fallback, <NoAccess module={module} reason="error" />);
  if (reason === "no-role") return renderFallback(fallback, <NoAccess module={module} reason="no-role" />);

  if (!module || !perms || !role) return <>{children}</>;

  const level = getAccessLevel(perms, role, module);
  if (!hasSufficientAccess(level, minAccess)) {
    return renderFallback(
      fallback,
      <NoAccess module={module} reason="forbidden" requiredAccess={minAccess} currentAccess={level} />,
    );
  }

  return <>{children}</>;
}
