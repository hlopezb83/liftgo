import { useEffect, useState, type ReactNode } from "react";
import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useRecoveryStatus } from "@/features/auth";
import { Sentry } from "@/lib/observability/sentry";
import { useLocation } from "@/lib/router-compat";
import { Link, Navigate } from "@/lib/router-compat-ui";
import { setAuthSnapshot } from "@/lib/ui/authSnapshot";
import { canAccessPlatformRoute, usePlatformAccessStatus } from "../hooks/usePlatformAccess";
import { ORGANIZATION_WORKSPACE, PLATFORM_LOGIN } from "../lib/platformNavigation";
import { PlatformAccessScope } from "./PlatformAccessScope";

export function PlatformGuard({ children }: { children: ReactNode }) {
  const { user, isLoading, signOut } = useAuth();
  const operator = usePlatformAccessStatus();
  const recovery = useRecoveryStatus();
  const { pathname } = useLocation();
  const loading = isLoading || (!!user && operator.isPending);
  const [timedOut, setTimedOut] = useState(false);
  const [wasLoading, setWasLoading] = useState(loading);
  if (wasLoading !== loading) {
    setWasLoading(loading);
    setTimedOut(false);
  }
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOut(true), 8_000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const role = !operator.isError && operator.data?.isOperator === true ? "platform_operator" : null;
    setAuthSnapshot({ user: user ? { id: user.id, email: user.email ?? null } : null, organization: null, role });
    Sentry.setUser(user ? { id: user.id } : null);
    Sentry.setTag("role", role ?? "unknown");
    return () => {
      setAuthSnapshot({ user: null, organization: null, role: null });
      Sentry.setUser(null);
      Sentry.setTag("role", "unknown");
    };
  }, [user, operator.data, operator.isError]);

  if (recovery !== "idle") return <Navigate to="/auth" replace />;
  if (loading && timedOut) {
    return <AccessState title="No se pudo verificar el acceso" description="La carga está tardando más de lo normal. Revisa tu conexión.">
      <Button onClick={() => window.location.reload()}>Reintentar</Button>
    </AccessState>;
  }
  if (loading) {
    return <AccessState title="Verificando acceso…" description="Comprobando tu cuenta de plataforma." />;
  }
  if (!user) return <Navigate to={`${PLATFORM_LOGIN}?next=${encodeURIComponent(pathname)}`} replace />;
  if (operator.isError) {
    return (
      <AccessState title="No se pudo verificar el acceso" description="Revisa tu conexión e inténtalo de nuevo.">
        <ErrorDiagnostic error={operator.error} title="No se pudo verificar el acceso de plataforma" phase="platform-access" />
        <Button onClick={() => void operator.refetch()}>Reintentar</Button>
      </AccessState>
    );
  }
  if (operator.data?.isOperator !== true) {
    return (
      <AccessState title="Acceso restringido" description="Tu cuenta no tiene permiso de Operador de plataforma.">
        <p className="text-sm text-muted-foreground break-all">{user.email}</p>
        <Button asChild variant="outline"><Link to={ORGANIZATION_WORKSPACE}>Ir a mi espacio</Link></Button>
        <Button onClick={() => void signOut()}>Cerrar sesión</Button>
      </AccessState>
    );
  }
  if (!canAccessPlatformRoute(operator.data, pathname)) {
    return <AccessState title="Acción no autorizada" description="Tu perfil no tiene acceso a esta sección de plataforma.">
      <Button asChild variant="outline"><Link to="/platform">Ir al inicio de plataforma</Link></Button>
    </AccessState>;
  }
  return <PlatformAccessScope key={`${user.id}:${operator.data.revision}`} access={operator.data}>{children}</PlatformAccessScope>;
}

function AccessState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center" role="status">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Centro de Plataforma LiftGo</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
      </div>
    </main>
  );
}
