import { useAuth } from "@/hooks/useAuth";
import AuthPage from "@/pages/AuthPage";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary" />
          <span className="text-lg font-semibold text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <>{children}</>;
}
