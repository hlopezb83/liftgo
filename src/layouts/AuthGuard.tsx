import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/features/users";
import AuthPage from "@/features/auth/pages/AuthPage";
import { CustomerPortalRoutes } from "@/layouts/CustomerPortalRoutes";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { data: role, isLoading: roleLoading } = useUserRole();

  if (isLoading || (user && roleLoading)) {
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

  if (!user) {
    return <AuthPage />;
  }

  if (role === "customer") {
    return <CustomerPortalRoutes />;
  }

  return <>{children}</>;
}
