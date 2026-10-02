import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { listPlatformSupportFn } from "@/lib/platformSupport.functions";
import { SUPPORT_SEVERITIES, SUPPORT_STATUSES, type SupportListInput } from "@/lib/platformSupport.types";
import { PlatformSupportDetail } from "../components/PlatformSupportDetail";
import { healthDate } from "../hooks/usePlatformHealth";
import { usePlatformOrganizations } from "../hooks/usePlatformOperator";

export default function PlatformSupportPage() {
  const [filters, setFilters] = useState<SupportListInput>({ search: "", offset: 0, status: null, severity: null });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const companies = usePlatformOrganizations(true);
  const query = useQuery({ queryKey: ["platform", "support", "list", filters], queryFn: () => listPlatformSupportFn({ data: filters }), staleTime: 30_000 });
  return <>
    <PageHeader title="Soporte de plataforma" subtitle="Diagnósticos compartidos por usuarios internos de cada empresa."
      actions={<Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Actualizar bandeja</Button>} />
    <form className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-6" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, search, offset: 0 }); }}>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="support-search">Buscar empresa, folio, módulo o título</Label>
        <div className="flex gap-2"><Input id="support-search" value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} /><Button type="submit" variant="outline">Buscar</Button></div></div>
      <div className="space-y-2"><Label htmlFor="support-filter-status">Estado</Label>
        <select id="support-filter-status" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.status ?? ""}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as SupportListInput["status"] || null, offset: 0 })}>
          <option value="">Todos los estados</option>{Object.entries(SUPPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="support-filter-severity">Severidad</Label>
        <select id="support-filter-severity" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.severity ?? ""}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value as SupportListInput["severity"] || null, offset: 0 })}>
          <option value="">Todas las severidades</option>{Object.entries(SUPPORT_SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="support-filter-company">Empresa</Label>
        <select id="support-filter-company" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.organizationId ?? ""} disabled={companies.isPending || companies.isError}
          onChange={(e) => setFilters({ ...filters, organizationId: e.target.value || null, offset: 0 })}>
          <option value="">Todas las empresas</option>{companies.data?.map((company) => <option key={company.id} value={company.id}>{company.razon_social || company.name}</option>)}</select>
        {companies.isError && <Button type="button" variant="outline" size="sm" onClick={() => void companies.refetch()}>Reintentar filtro de empresas</Button>}</div>
    </form>
    {query.isError ? <QueryErrorState entity="los casos de soporte" onRetry={() => void query.refetch()} /> : query.isPending ? <Skeleton className="h-64" /> : <>
      <p className="text-xs text-muted-foreground">{query.data.total} casos · Consulta: {healthDate(query.data.observedAt)}</p>
      <ul aria-label="Casos de soporte" className="divide-y rounded-xl border bg-card">{query.data.rows.map((row) => <li key={row.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 space-y-2"><p className="text-xs text-muted-foreground">{row.organizationName} · <span className="font-mono">{row.folio}</span></p>
          <h2 className="break-words font-semibold">{row.title || "Diagnóstico retirado"}</h2>
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">{SUPPORT_STATUSES[row.status]}</Badge><Badge variant="outline">{SUPPORT_SEVERITIES[row.severity]}</Badge>
            {row.module && <Badge variant="outline">{row.module}</Badge>}</div>
          <p className="text-xs text-muted-foreground">{row.assigneeName || "Sin responsable"} · Actualizado: {healthDate(row.updatedAt)}</p>
        </div><Button variant="outline" className="shrink-0" onClick={() => setSelected(row.id)}>Ver caso</Button></li>)}</ul>
      {query.data.rows.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-medium">No hay casos con estos filtros</h2>
        <p className="mt-2 text-sm text-muted-foreground">Los usuarios pueden compartir un diagnóstico desde Mis reportes en su ERP.</p></div>}
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {(filters.offset ?? 0) / 25 + 1}</p>
        <div className="flex gap-2"><Button variant="outline" disabled={!filters.offset || query.isFetching} onClick={() => setFilters({ ...filters, offset: (filters.offset ?? 0) - 25 })}>Anterior</Button>
          <Button variant="outline" disabled={(filters.offset ?? 0) + 25 >= query.data.total || query.isFetching} onClick={() => setFilters({ ...filters, offset: (filters.offset ?? 0) + 25 })}>Siguiente</Button></div></div>
    </>}
    {selected && <PlatformSupportDetail key={selected} caseId={selected} onClose={() => setSelected(null)} />}
  </>;
}
