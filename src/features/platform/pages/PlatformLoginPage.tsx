import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  if (recovery !== "idle") return <AuthPage platform destination={destination} />;
  if (isLoading) return <PlatformLoginLoading />;
  if (user) return <Navigate to={destination} replace />;
  return <AuthPage platform destination={destination} />;
}

function PlatformLoginLoading() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 8_000);
    return () => clearTimeout(timer);
  }, []);
  return <main className="min-h-[100dvh] flex items-center justify-center p-6" role="status">
    {timedOut ? <div className="max-w-md space-y-4 text-center">
      <h1 className="text-xl font-semibold">No se pudo verificar la sesión</h1>
      <p className="text-sm text-muted-foreground">Revisa tu conexión e inténtalo de nuevo.</p>
      <Button onClick={() => window.location.reload()}>Reintentar</Button>
    </div> : <p>Verificando sesión…</p>}
  </main>;
}
