import { useUserRole } from "@/features/users/hooks/useUserRole";
import { useRolePermissions, getAccessLevel, type AccessLevel } from "@/features/users/hooks/useRolePermissions";
import { NoAccess } from "@/layouts/NoAccess";

interface RoleGuardProps {
  module?: string;
  minAccess?: AccessLevel;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ module, minAccess = "read", children, fallback }: RoleGuardProps) {
  const { data: role, isLoading: roleLoading, isError: roleError } = useUserRole();
  const { data: perms, isLoading: permsLoading, isError: permsError } = useRolePermissions();

  // Still loading — render nothing to avoid flicker (AuthGuard already shows spinner on first load)
  if (roleLoading || permsLoading) return null;

  // Failed to fetch role/permissions
  if (roleError || permsError) {
    return fallback ?? <NoAccess module={module} reason="error" />;
  }

  // Authenticated but no role assigned
  if (!role) {
    return fallback ?? <NoAccess module={module} reason="no-role" />;
  }

  // Role exists but lacks required access for this module
  if (module && perms) {
    const level = getAccessLevel(perms, role, module);
    const hierarchy: AccessLevel[] = ["none", "read", "full"];
    if (hierarchy.indexOf(level) < hierarchy.indexOf(minAccess)) {
      return fallback ?? <NoAccess module={module} reason="forbidden" requiredAccess={minAccess} currentAccess={level} />;
    }
  }

  return <>{children}</>;
}
