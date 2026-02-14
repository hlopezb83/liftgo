import { useUserRole, type AppRole } from "@/hooks/useUserRole";

interface RoleGuardProps {
  allowed: AppRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ allowed, children, fallback = null }: RoleGuardProps) {
  const { data: role } = useUserRole();
  if (!role || !allowed.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
