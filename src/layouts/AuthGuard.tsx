import { useIsRestoring } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { OrganizationGate } from "@/contexts/OrganizationContext";
import { useRecoveryStatus } from "@/features/auth/hooks/useRecoveryStatus";
import { platformEntryDestination, usePlatformOperatorStatus } from "@/features/platform";
import { useUserRole } from "@/features/users";
import { OfflineBanner } from "@/layouts/OfflineBanner";
import { useLocation } from "@/lib/router-compat";
import { Navigate } from "@/lib/router-compat-ui";


// R6-FE-10 (offline): sin red la carga de auth/rol nunca resuelve y el splash
// era infinito. Tras ~8s se muestra pantalla de error con Reintentar.
const LOADING_TIMEOUT_MS = 8_000;

const AuthPage = lazy(() => import("@/features/auth/pages/AuthPage"));

function AppLoader({ hint }: { hint?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-12 w-12 rounded-xl bg-primary animate-spin [animation-duration:1.5s]"
          style={{ borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" }}
        />
        <p className="text-sm text-muted-foreground">Cargando LiftGo…</p>
        {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
      </div>
    </div>
  );
}

function LoadingError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-4">
        <p className="text-lg font-medium">No se pudo cargar LiftGo</p>
        <p className="text-sm text-muted-foreground">
          {navigator.onLine
            ? "La carga está tardando más de lo normal. Revisa tu conexión e inténtalo de nuevo."
            : "Parece que no tienes conexión a internet. Conéctate y reintenta."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { data: role, isLoading: roleLoading } = useUserRole();
  const location = useLocation();
  const inPortal = location.pathname.startsWith("/portal");
  const recovery = useRecoveryStatus();
  const platform = usePlatformOperatorStatus();
  const platformDestination = platformEntryDestination(location.pathname, location.search);
  // R7 Bloque 17b: durante la restauración del caché persistido, muchas queries
  // reportan `isLoading=false` con `data=undefined`, lo que provocaba un flash
  // del portal o del `NoAccess` antes de que TanStack hidratara el rol.
  const isRestoring = useIsRestoring();

  // Un operador puede entrar sin rol empresarial ni membresía. Se resuelve
  // primero su acceso global; el rol sigue siendo obligatorio para el ERP.
  const stillLoading = authIsLoading({
    hasUser: !!user, authLoading: isLoading, roleLoading, isRestoring,
    destination: platformDestination, platform,
  });

  const [timedOut, setTimedOut] = useState(false);
  // El reset se hace como estado derivado durante el render (patrón soportado
  // por React) para no encadenar renders con un setState dentro del efecto.
  const [prevLoading, setPrevLoading] = useState(stillLoading);
  if (prevLoading !== stillLoading) {
    setPrevLoading(stillLoading);
    if (!stillLoading) setTimedOut(false);
  }
  useEffect(() => {
    if (!stillLoading) return;
    const t = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [stillLoading]);

  // AUTH-REC-01: mientras haya un flujo de recuperación en curso (enlace en
  // frío, evento del SDK o enlace inválido) SIEMPRE se muestra AuthPage,
  // aunque ya exista `user` — antes la sesión de recuperación desmontaba el
  // formulario de nueva contraseña.
  if (recovery !== "idle") {
    return (
      <Suspense fallback={<AppLoader />}>
        <AuthPage />
      </Suspense>
    );
  }

  if (stillLoading) {

    return (
      <>
        <OfflineBanner />
        {timedOut ? (
          <LoadingError onRetry={() => window.location.reload()} />
        ) : (
          // R7-FE-04 (N7-UX-04): la percepción de ~15 s son las latencias previas
          // (restauración de sesión + rol). Mostrar la fase reduce la incertidumbre
          // sin modificar timeouts (opción menos invasiva).
          <AppLoader hint={isLoading ? "Conectando…" : "Verificando sesión…"} />
        )}
      </>
    );
  }


  if (!user) {
    return (
      <Suspense fallback={<AppLoader />}>
        <AuthPage />
      </Suspense>
    );
  }

  return (
    <PlatformEntry destination={platformDestination} platform={platform}>
      <OrganizationWorkspaceGuard role={role} inPortal={inPortal}>{children}</OrganizationWorkspaceGuard>
    </PlatformEntry>
  );
}

type PlatformStatus = Pick<ReturnType<typeof usePlatformOperatorStatus>, "data" | "isPending" | "isError" | "refetch">;

function authIsLoading({ hasUser, authLoading, roleLoading, isRestoring, destination, platform }: {
  hasUser: boolean; authLoading: boolean; roleLoading: boolean; isRestoring: boolean;
  destination: string | null; platform: PlatformStatus;
}): boolean {
  const resolvingPlatform = hasUser && !!destination;
  const platformOwnsEntry = resolvingPlatform && (platform.data === true || platform.isError);
  return authLoading || (resolvingPlatform && platform.isPending) ||
    (!platformOwnsEntry && (isRestoring || (hasUser && roleLoading)));
}

function PlatformEntry({ destination, platform, children }: { destination: string | null; platform: PlatformStatus; children: ReactNode }) {
  if (!destination) return children;
  if (platform.isError) return <LoadingError onRetry={() => void platform.refetch()} />;
  if (platform.data === true) return <Navigate to={destination} replace />;
  return children;
}

function OrganizationWorkspaceGuard({ role, inPortal, children }: {
  role: ReturnType<typeof useUserRole>["data"]; inPortal: boolean; children: ReactNode;
}) {
  // Los clientes viven en /portal/* y los usuarios internos fuera de él.
  // Antes CustomerPortalRoutes renderizaba el portal en cualquier URL para
  // clientes; ahora cada árbol tiene su layout y el guard redirige al correcto.
  // Multi-organización: nada protegido se renderiza hasta que la empresa del
  // usuario queda verificada contra organization_memberships (y la cuenta del
  // portal cuando aplica).
  const gated = (
    <OrganizationGate fallback={<AppLoader hint="Verificando empresa…" />}>
      {children}
    </OrganizationGate>
  );

  if (role === "customer") {
    if (!inPortal) return <Navigate to="/portal" replace />;
    return gated;
  }

  if (inPortal) return <Navigate to="/" replace />;

  return gated;
}
