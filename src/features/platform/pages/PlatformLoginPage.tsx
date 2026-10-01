import { useAuth } from "@/contexts/AuthContext";
import { AuthPage, useRecoveryStatus } from "@/features/auth";
import { useLocation } from "@/lib/router-compat";
import { Navigate } from "@/lib/router-compat-ui";
import { platformReturnDestination } from "../lib/platformNavigation";

export default function PlatformLoginPage() {
  const { user, isLoading } = useAuth();
  const recovery = useRecoveryStatus();
  const { search } = useLocation();
  const destination = platformReturnDestination(search);
  if (isLoading) return <main className="min-h-[100dvh] flex items-center justify-center" role="status">Verificando sesión…</main>;
  if (user && recovery === "idle") return <Navigate to={destination} replace />;
  return <AuthPage platform destination={destination} />;
}
