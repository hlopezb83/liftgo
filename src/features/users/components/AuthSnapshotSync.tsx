import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { setAuthSnapshot } from "@/lib/ui/authSnapshot";
import { setAppVersion } from "@/lib/ui/errorReport";
import { Sentry } from "@/lib/observability/sentry";
import { useUserRole } from "../hooks/useUserRole";

/**
 * Puente entre los hooks de React y el snapshot sincrónico usado por
 * `buildErrorReport`. Montar una vez dentro de `AuthProvider`. Sin UI.
 */
export function AuthSnapshotSync(): null {
  const { user } = useAuth();
  const { data: role } = useUserRole();

  useEffect(() => {
    setAuthSnapshot({
      user: user ? { id: user.id, email: user.email ?? null } : null,
      organization: null, // LiftGo es single-tenant hoy
      role: role ?? null,
    });
    // Sentry: correlaciona errores con el usuario/rol activo. Sólo id — el
    // email es PII y además `scrubEvent` lo tumba en beforeSend por defecto.
    if (user) {
      Sentry.setUser({ id: user.id });
      Sentry.setTag("role", role ?? "unknown");
    } else {
      Sentry.setUser(null);
    }
  }, [user, role]);

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
