import { useUserRole } from "@/features/users/hooks/useUserRole";
import { useRolePermissions, getAccessLevel, type AccessLevel } from "@/features/users/hooks/useRolePermissions";
import { NoAccess } from "@/layouts/NoAccess";

interface RoleGuardProps {
  module?: string;
  minAccess?: AccessLevel;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const ACCESS_HIERARCHY: AccessLevel[] = ["none", "read", "full"];

function hasSufficientAccess(level: AccessLevel, required: AccessLevel): boolean {
  return ACCESS_HIERARCHY.indexOf(level) >= ACCESS_HIERARCHY.indexOf(required);
}

export function RoleGuard({ module, minAccess = "read", children, fallback }: RoleGuardProps) {
  const { data: role, isLoading: roleLoading, isError: roleError } = useUserRole();
  const { data: perms, isLoading: permsLoading, isError: permsError } = useRolePermissions();

  if (roleLoading || permsLoading) return null;
  if (roleError || permsError) return fallback ?? <NoAccess module={module} reason="error" />;
  if (!role) return fallback ?? <NoAccess module={module} reason="no-role" />;

  if (module && perms) {
    const level = getAccessLevel(perms, role, module);
    if (!hasSufficientAccess(level, minAccess)) {
      return fallback ?? <NoAccess module={module} reason="forbidden" requiredAccess={minAccess} currentAccess={level} />;
    }
  }

  return <>{children}</>;
}
