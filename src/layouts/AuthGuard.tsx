import { useIsRestoring } from "@tanstack/react-query";
import { Suspense, lazy, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users";
import { PageFallback } from "@/routes/routes-config";

const AuthPage = lazy(() => import("@/features/auth/pages/AuthPage"));
const CustomerPortalRoutes = lazy(() =>
  import("@/layouts/CustomerPortalRoutes").then((m) => ({ default: m.CustomerPortalRoutes })),
);

function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-12 w-12 rounded-xl bg-primary animate-spin [animation-duration:1.5s]"
          style={{ borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" }}
        />
        <p className="text-sm text-muted-foreground">Cargando LiftGo…</p>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { data: role, isLoading: roleLoading } = useUserRole();
  // R7 Bloque 17b: durante la restauración del caché persistido, muchas queries
  // reportan `isLoading=false` con `data=undefined`, lo que provocaba un flash
  // del portal o del `NoAccess` antes de que TanStack hidratara el rol.
  const isRestoring = useIsRestoring();

  if (isRestoring || isLoading || (user && roleLoading)) {
    return <AppLoader />;
  }


  if (!user) {
    return (
      <Suspense fallback={<AppLoader />}>
        <AuthPage />
      </Suspense>
    );
  }

  if (role === "customer") {
    return (
      <Suspense fallback={<PageFallback />}>
        <CustomerPortalRoutes />
      </Suspense>
    );
  }

  return <>{children}</>;
}
