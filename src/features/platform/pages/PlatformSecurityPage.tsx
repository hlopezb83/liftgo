import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorDiagnostic } from "@/components/feedback/ErrorDiagnostic";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { PLATFORM_PROFILE_LABELS } from "@/lib/platformAccess.types";
import { getPlatformSessionFn } from "@/lib/platformOperators.functions";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";

export default function PlatformSecurityPage() {
  const { user, signOut, resetPassword } = useAuth();
  const [sending, setSending] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryError, setRecoveryError] = useState<unknown>(null);
  const { access } = usePlatformCapabilities();
  const query = useQuery({ queryKey: ["platform", "session", user?.id], queryFn: () => getPlatformSessionFn(),
    staleTime: 0, refetchOnWindowFocus: "always", refetchInterval: 30_000, meta: { silent: true } });
  async function recover() {
    if (!user?.email || sending || !query.isSuccess) return;
    setSending(true); setRecoveryMessage(""); setRecoveryError(null);
    try {
      const result = await resetPassword(user.email, "platform");
      if (result.error) setRecoveryError(result.error);
      setRecoveryMessage(result.error ? "No se pudo enviar el enlace. Reintenta en unos minutos." : "Revisa tu correo para continuar la recuperación.");
    } catch (error) { setRecoveryError(error); setRecoveryMessage("No se pudo enviar el enlace. Reintenta en unos minutos."); }
    finally { setSending(false); }
  }
  return <>
    <PageHeader title="Mi sesión" subtitle="Tu acceso al Centro de Plataforma y las opciones de recuperación." />
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-5" aria-label="Sesión actual">
      <div className="space-y-2"><h2 className="font-semibold">Cuenta de plataforma</h2>
        <p className="break-all text-sm text-muted-foreground">{user?.email}</p>
        {access?.profile && <Badge variant="outline">{PLATFORM_PROFILE_LABELS[access.profile]}</Badge>}
      </div>
      {query.isError ? <QueryErrorState error={query.error} entity="tu sesión" onRetry={() => void query.refetch()} isRetrying={query.isFetching} />
        : query.isPending ? <Skeleton className="h-12 w-full" /> : <div className="space-y-2">
          <p role="status" className="text-sm font-medium">Tu sesión está activa</p>
          <p className="text-sm text-muted-foreground">Inicio: {new Date(query.data.startedAt).toLocaleString("es-MX")}</p>
        </div>}
      <p className="text-sm text-muted-foreground">Los cambios de acceso de operadores requieren tu contraseña actual.</p>
      <Button variant="outline" onClick={() => void signOut()}>Cerrar sesión</Button>
    </section>
    <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4" aria-label="Recuperar contraseña">
      <h2 className="font-semibold">¿Olvidaste tu contraseña?</h2>
      <p className="text-sm text-muted-foreground">Recibe un enlace en el correo de tu cuenta. También puedes usar «Olvidé mi contraseña» en la entrada del Centro de Plataforma.</p>
      <Button variant="outline" disabled={sending || !query.isSuccess} onClick={() => void recover()}>{sending ? "Enviando…" : "Enviar enlace de recuperación"}</Button>
      {recoveryMessage && <p role="status" className="text-sm">{recoveryMessage}</p>}
      {recoveryError != null && <ErrorDiagnostic error={recoveryError} title="No se pudo enviar el enlace de recuperación" phase="password-recovery" />}
    </section>
  </>;
}
