import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { PlatformSessionProvider, isPlatformPath } from "@/features/platform";
import { AuthSnapshotSync } from "@/features/users";
import { IdentityScopedPersistence } from "@/lib/query/IdentityScopedPersistence";
import { useLocation } from "@/lib/router-compat";
import type { ReactNode } from "react";

/** El Centro global no monta proveedores que exijan una empresa verificada. */
export function WorkspaceProviders({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (isPlatformPath(pathname)) {
    return <PlatformSessionProvider>{children}</PlatformSessionProvider>;
  }
  return (
    <OrganizationProvider>
      <AuthSnapshotSync />
      <IdentityScopedPersistence>{children}</IdentityScopedPersistence>
    </OrganizationProvider>
  );
}
