import { useMemo } from "react";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { useRolePermissions, ROUTE_TO_MODULE, type AccessLevel } from "@/hooks/useRolePermissions";
import { NAV_GROUPS, ALWAYS_VISIBLE_ROUTES, type NavGroup } from "@/components/sidebar/navConfig";

function getItemAccess(
  perms: Record<string, Record<string, AccessLevel>> | undefined,
  role: AppRole | undefined,
  url: string,
): AccessLevel {
  if (!perms || !role) return "none";
  if (ALWAYS_VISIBLE_ROUTES.includes(url)) return "full";
  const module = ROUTE_TO_MODULE[url];
  if (!module) return "full";
  return perms[role]?.[module] ?? "none";
}

export function useVisibleNavGroups(): NavGroup[] {
  const { data: role } = useUserRole();
  const { data: perms } = useRolePermissions();

  return useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        label: group.label,
        items: group.items.filter((item) => getItemAccess(perms, role, item.url) !== "none"),
      })).filter((group) => group.items.length > 0),
    [perms, role],
  );
}
