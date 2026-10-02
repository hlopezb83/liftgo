import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { checkPlatformIntegrationFn, listPlatformIntegrationsFn } from "@/lib/platformHealth.functions";
import { INTEGRATION_STATUS_LABELS } from "@/lib/platformHealth.types";
import { PlatformIntegrationCard } from "../components/PlatformIntegrationCard";
import { usePlatformCapabilities } from "../hooks/usePlatformAccess";
import { healthDate } from "../hooks/usePlatformHealth";

export default function PlatformIntegrationsPage() {
  const { can } = usePlatformCapabilities();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: ["platform", "health", "integrations", search, offset], staleTime: 30_000,
    queryFn: () => listPlatformIntegrationsFn({ data: { search, offset } }) });
  const check = useMutation({ retry: false, meta: { silent: true }, mutationFn: (organizationId: string) => checkPlatformIntegrationFn({
    data: { organizationId, requestId: crypto.randomUUID() },
  }), onSettled: () => void cache.invalidateQueries({ queryKey: ["platform", "health"] }) });
  return <>
    <PageHeader title="Integraciones por empresa" subtitle="Facturapi: configuración, conexión y cola fiscal."
      actions={<Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar listado</Button>} />
    <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => {
        event.preventDefault(); setSearch(draft.trim()); setOffset(0); check.reset();
      }}>
        <div className="flex-1 space-y-2"><Label htmlFor="integration-search">Buscar empresa</Label>
          <Input id="integration-search" value={draft} maxLength={100} onChange={(event) => setDraft(event.target.value)} /></div>
        <Button type="submit" variant="outline">Buscar</Button>
      </form>
      <p className="text-sm text-muted-foreground">Una llave configurada no confirma la conexión. Cada comprobación consulta Facturapi sin emitir documentos; no valida RFC, certificados ni capacidad de timbrado. Se permite una comprobación por minuto y empresa.</p>
    </div>
    {check.isError && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">{check.error.message || "No se pudo comprobar. Actualiza antes de repetir."}</p>}
    {check.isSuccess && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">Resultado: {INTEGRATION_STATUS_LABELS[check.data.status]}.</p>}
    {query.isError ? <QueryErrorState entity="las integraciones" onRetry={() => void query.refetch()} isRetrying={query.isFetching} />
      : query.isPending ? <Skeleton className="h-56 w-full" /> : <>
        <p className="text-xs text-muted-foreground">{query.data.total} empresas · Consulta a la base: {healthDate(query.data.observedAt)}</p>
        <ul aria-label="Integraciones de Facturapi" className="space-y-4">{query.data.rows.map((row) => <PlatformIntegrationCard key={row.id} row={row} observedAt={query.data.observedAt}
          canCheck={can("integrations.check")} checking={check.isPending && check.variables === row.id} disabled={check.isPending}
          onCheck={() => check.mutate(row.id)} />)}</ul>
        {query.data.rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay empresas que coincidan con esta búsqueda.</p>}
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {offset / 25 + 1}</p>
          <div className="flex gap-2"><Button variant="outline" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(offset - 25)}>Anterior</Button>
            <Button variant="outline" disabled={offset + 25 >= query.data.total || query.isFetching} onClick={() => setOffset(offset + 25)}>Siguiente</Button></div></div>
      </>}
  </>;
}
