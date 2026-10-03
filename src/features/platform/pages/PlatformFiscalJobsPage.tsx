import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { countLabel } from "@/lib/format/countLabel";
import { listPlatformFiscalJobsFn } from "@/lib/platformFiscalJobs.functions";
import type { FiscalJobsInput } from "@/lib/platformFiscalJobs.types";
import { PlatformFiscalJobCard } from "../components/PlatformFiscalJobCard";
import { PlatformFiscalJobDetail } from "../components/PlatformFiscalJobDetail";
import { PlatformFiscalJobFilters } from "../components/PlatformFiscalJobFilters";
import { healthDate } from "../hooks/usePlatformHealth";

export default function PlatformFiscalJobsPage() {
  const [filters, setFilters] = useState<FiscalJobsInput>({ search: "", offset: 0 });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["platform", "fiscal-jobs", "list", filters], staleTime: 30_000, retry: false,
    queryFn: ({ signal }) => listPlatformFiscalJobsFn({ data: filters, signal }) });
  return <>
    <PageHeader title="Trabajos fiscales" subtitle="Cola de Facturapi por empresa, documento y operación."
      actions={<Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar trabajos</Button>} />
    <PlatformFiscalJobFilters filters={filters} search={search} onSearch={setSearch} onChange={setFilters} />
    <p className="text-sm text-muted-foreground">Los estados describen la cola del ERP. Finalizado en cola no confirma por sí solo un CFDI timbrado o cancelado; un resultado incierto requiere conciliación.</p>
    {query.isError ? <QueryErrorState error={query.error} entity="los trabajos fiscales" onRetry={() => void query.refetch()} /> : query.isPending ? <Skeleton className="h-64" /> : <>
      <p className="text-xs text-muted-foreground">{countLabel(query.data.total, "trabajo", "trabajos")} · Consulta: {healthDate(query.data.observedAt)}</p>
      {query.data.rows.length > 0 ? <ul aria-label="Trabajos fiscales" className="divide-y rounded-xl border bg-card">
        {query.data.rows.map((job) => <PlatformFiscalJobCard key={job.id} job={job} onOpen={() => setSelected(job.id)} />)}</ul>
        : <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-medium">No hay trabajos con estos filtros</h2>
          <p className="mt-2 text-sm text-muted-foreground">La cola registra fallos transitorios. Una cola vacía no acredita que todos los documentos fiscales estén conciliados.</p></div>}
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {(filters.offset ?? 0) / 25 + 1}</p>
        <div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={!filters.offset || query.isFetching} onClick={() => setFilters({ ...filters, offset: (filters.offset ?? 0) - 25 })}>Anterior</Button>
          <Button variant="outline" className="min-h-11" disabled={(filters.offset ?? 0) + 25 >= query.data.total || query.isFetching} onClick={() => setFilters({ ...filters, offset: (filters.offset ?? 0) + 25 })}>Siguiente</Button></div></div>
    </>}
    {selected && <PlatformFiscalJobDetail key={selected} jobId={selected} onClose={() => setSelected(null)} />}
  </>;
}
