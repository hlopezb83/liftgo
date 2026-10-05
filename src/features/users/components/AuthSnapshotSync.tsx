import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { companySettingsQueries, publicBrandingQueries } from "@/features/company-settings";
import { clearSentryIdentity, syncSentryIdentity } from "@/lib/observability/identity";
import { setAuthSnapshot } from "@/lib/ui/authSnapshot";
import { setAppVersion } from "@/lib/ui/errorReport";
import { useUserRole } from "../hooks/useUserRole";

/**
 * Puente entre los hooks de React y el snapshot sincrónico usado por
 * `buildErrorReport`. Montar una vez dentro de `AuthProvider`. Sin UI.
 */
export function AuthSnapshotSync(): null {
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const organizationId = useVerifiedOrganizationId();
  const cache = useQueryClient();

  useEffect(() => {
    const update = () => {
      const company = cache.getQueryData<{ razon_social?: string | null }>(companySettingsQueries.keys.lists());
      const branding = cache.getQueryData<{ razon_social?: string | null }>(publicBrandingQueries.keys.lists());
      const sidebarName = cache.getQueryData<string>(["sidebar-organization-name", organizationId]);
      setAuthSnapshot({
        user: user ? { id: user.id, email: user.email ?? null } : null,
        organization: organizationId ? { id: organizationId,
          name: company?.razon_social?.trim() || branding?.razon_social?.trim() || sidebarName?.trim() || "" } : null,
        role: role ?? null,
      });
    };
    update();
    const unsubscribe = cache.getQueryCache().subscribe(update);
    const revision = syncSentryIdentity({ userId: user?.id ?? null, organizationId: organizationId ?? null,
      role: user ? role ?? null : null,
      workspace: typeof window !== "undefined" && window.location.pathname.startsWith("/portal") ? "portal" : "organization" });
    return () => {
      unsubscribe();
      if (clearSentryIdentity(revision)) setAuthSnapshot({ user: null, organization: null, role: null });
    };
  }, [user, role, organizationId, cache]);

  // Lee la versión actual desde /version.json (~50 bytes vs ~380KB del changelog).
  useEffect(() => {
    let cancelled = false;
    fetch("/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "version" in data) {
          const v = (data as { version?: unknown }).version;
          if (typeof v === "string" && v.length > 0) setAppVersion(v);
        }
      })
      .catch(() => { /* silencioso: dev sin prebuild queda en "unknown" */ });
    return () => { cancelled = true; };
  }, []);

  return null;
}
