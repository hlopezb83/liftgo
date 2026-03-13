import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { useRolePermissions, type AccessLevel } from "@/hooks/useRolePermissions";

interface RoleGuardProps {
  allowed?: AppRole[];
  module?: string;
  minAccess?: AccessLevel;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowed, module, minAccess = "read", children, fallback = null }: RoleGuardProps) {
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();

  if (!role) return <>{fallback}</>;

  // Legacy static check
  if (allowed && !allowed.includes(role)) return <>{fallback}</>;

  // Dynamic permission check
  if (module && perms) {
    const level = perms[role]?.[module] ?? "none";
    const hierarchy: AccessLevel[] = ["none", "read", "full"];
    if (hierarchy.indexOf(level) < hierarchy.indexOf(minAccess)) return <>{fallback}</>;
  }

  return <>{children}</>;
}
