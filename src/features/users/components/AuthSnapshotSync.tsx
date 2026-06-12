import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users/hooks/useUserRole";
import { setAuthSnapshot } from "@/lib/ui/authSnapshot";
import { setAppVersion } from "@/lib/ui/errorReport";

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
  }, [user, role]);

  // Lee la versión actual del changelog (best-effort, sin bloquear).
  useEffect(() => {
    let cancelled = false;
    fetch("/changelog.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0] as { version?: string };
          if (first?.version) setAppVersion(first.version);
        }
      })
      .catch(() => { /* silencioso */ });
    return () => { cancelled = true; };
  }, []);

  return null;
}
