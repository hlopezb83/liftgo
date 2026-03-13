import { useUserRole } from "@/hooks/useUserRole";
import { useRolePermissions, getAccessLevel, type AccessLevel } from "@/hooks/useRolePermissions";

interface RoleGuardProps {
  module?: string;
  minAccess?: AccessLevel;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ module, minAccess = "read", children, fallback = null }: RoleGuardProps) {
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();

  if (!role) return <>{fallback}</>;

  // Dynamic permission check via database
  if (module && perms) {
    const level = getAccessLevel(perms, role, module);
    const hierarchy: AccessLevel[] = ["none", "read", "full"];
    if (hierarchy.indexOf(level) < hierarchy.indexOf(minAccess)) return <>{fallback}</>;
  }

  return <>{children}</>;
}
