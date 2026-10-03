import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPlatformAccessFn } from "@/lib/platformAccess.functions";
import type { PlatformAccess, PlatformCapability } from "@/lib/platformAccess.types";

export const PlatformAccessContext = createContext<PlatformAccess | null>(null);

export function usePlatformAccessStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["platform", "access", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
    meta: { silent: true },
    queryFn: () => getPlatformAccessFn(),
  });
}

export function usePlatformCapabilities() {
  const access = useContext(PlatformAccessContext);
  const can = useCallback((capability: PlatformCapability) =>
    access?.isOperator === true && access.capabilities.includes(capability), [access]);
  return { access, can };
}

export function canAccessPlatformRoute(access: PlatformAccess, pathname: string): boolean {
  const can = (capability: PlatformCapability) => access.capabilities.includes(capability);
  if (!access.isOperator) return false;
  if (pathname === "/platform/security") return true;
  if (pathname === "/platform/operators") return can("operators.read");
  if (pathname === "/platform/integrations") return can("integrations.read");
  if (pathname === "/platform/fiscal-jobs") return can("integrations.read");
  if (pathname === "/platform/monitoring") return can("monitoring.read");
  if (pathname === "/platform/support") return can("support.read");
  if (pathname.startsWith("/platform/organizations/")) return can("organizations.details");
  if (pathname === "/platform/organizations") return can("organizations.read");
  if (pathname.startsWith("/platform/catalogs/import")) return can("catalogs.import") || can("templates.import");
  if (pathname.startsWith("/platform/catalogs")) return can("catalogs.read") || can("templates.read");
  if (pathname.startsWith("/platform/audit")) return can("audit.read");
  return pathname.replace(/\/$/, "") === "/platform";
}
