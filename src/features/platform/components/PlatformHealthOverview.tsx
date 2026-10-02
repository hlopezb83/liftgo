import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/lib/router-compat-ui";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { healthDate, usePlatformMonitoring } from "../hooks/usePlatformHealth";

export function PlatformHealthOverview() {
  const { can } = usePlatformCapabilities();
  const query = usePlatformMonitoring(can("monitoring.read"));
  if (!can("monitoring.read")) return null;
  if (query.isError) return <QueryErrorState entity="el estado operativo" onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  const data = query.data;
  const cards = [
    { label: "Altas por completar", value: data.pendingOnboarding },
    { label: "Configuración fiscal incompleta", value: data.incompleteBilling },
    { label: "Trabajos fiscales en cola", value: data.queuedJobs },
    { label: "Reintentos fiscales agotados", value: data.exhaustedJobs },
    { label: "Reportes abiertos", value: data.openReports },
  ];
  return <section aria-label="Estado operativo" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Estado operativo</h2>
        <p className="text-xs text-muted-foreground">Consulta a la base: {healthDate(data.observedAt)}</p></div>
      <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar estado</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => <div key={card.label} className="rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">{card.label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
      </div>)}
    </div>
    {can("integrations.read") && <Button asChild variant="outline"><Link to="/platform/integrations">Revisar integraciones por empresa</Link></Button>}
  </section>;
}
