import { useMemo } from "react";
import { ORGANIZATION_WORKSPACE, usePlatformOperatorStatus } from "@/features/platform";
import {
  getNavigationAccessLevel,
  useRolePermissions,
  useUserRole,
} from "@/features/users";
import {
  NAV_GROUPS,
  type NavGroup,
} from "@/layouts/sidebar/navConfig";

export function useVisibleNavGroups(): NavGroup[] {
  const { data: role, isError: roleError } = useUserRole();
  const { data: permissionData, isError: permissionsError } = useRolePermissions();
  const perms = roleError || permissionsError ? undefined : permissionData;
  // Tramo 9: los items de operación de plataforma sólo se muestran cuando el
  // servidor confirma al operador (fail-closed: sin dato = oculto).
  const { data: isPlatformOperator } = usePlatformOperatorStatus();

  return useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        label: group.label,
        collapsible: group.collapsible,
        defaultOpen: group.defaultOpen,
        items: group.items.filter(
          (item) =>
            item.platformOperatorOnly ? isPlatformOperator === true :
              getNavigationAccessLevel(perms, role ?? undefined, item.url) !== "none",
        ).map((item) => item.url === "/" && isPlatformOperator === true
          ? { ...item, destination: ORGANIZATION_WORKSPACE }
          : item),
      })).filter((group) => group.items.length > 0),
    [perms, role, isPlatformOperator],
  );
}
