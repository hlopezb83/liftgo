import { useCallback } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { SearchIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useHasModuleAccess } from "@/features/users";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { ClosedTable } from "../components/closed/ClosedTable";
import { useClosedProspects } from "../hooks/useClosedProspects";

function closedTabLabel(label: string, filtered: number, total: number, searching: boolean): string {
  return searching ? label + " (" + filtered + " de " + total + ")" : label + " (" + total + ")";
}

export default function CRMClosedPage() {
  const s = useClosedProspects();
  const navigate = useNavigateTransition();
  const handleViewCustomer = useCallback((id: string) => navigate(`/customers/${id}`), [navigate]);
  // R18-C1: sólo roles con acceso full a Clientes ven "Convertir".
  const canConvert = useHasModuleAccess("Clientes", "full");
  const searching = !!s.search.trim();
  const metricsSummary = `Cierres ganados (30 días): ${s.metrics.winRate30d}% · Ganados este mes: ${s.metrics.wonCountMTD} (${formatCurrency(s.metrics.wonTotalMTD)}) · Perdidos este mes: ${s.metrics.lostCountMTD}`;

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          title="Historial de prospectos cerrados"
          subtitle={s.isError ? undefined : s.isLoading ? "Cargando indicadores…" : metricsSummary}
          backHref="/crm"
          backLabel="Etapas de venta"
          actions={
            <div className="relative w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={s.search}
                onChange={(e) => s.setSearch(e.target.value)}
                placeholder="Buscar empresa o contacto…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          }
        />

        {/* FIX B3: sin esto, un fallo de carga se veía como historial vacío. */}
        {s.isError ? (
          <QueryErrorState entity="el historial de prospectos cerrados" onRetry={s.refetch} />
        ) : (
          <Tabs defaultValue="won">
            <TabsList>
              <TabsTrigger value="won">{s.isLoading ? "Ganados" : closedTabLabel("Ganados", s.wonRows.length, s.metrics.won.length, searching)}</TabsTrigger>
              <TabsTrigger value="lost">{s.isLoading ? "Perdidos" : closedTabLabel("Perdidos", s.lostRows.length, s.metrics.lost.length, searching)}</TabsTrigger>
            </TabsList>
            <TabsContent value="won" className="mt-4">
              <ClosedTable rows={s.wonRows} kind="won" isLoading={s.isLoading} hasActiveSearch={searching} onClearSearch={() => s.setSearch("")} onConvert={canConvert ? s.handleConvert : undefined} onViewCustomer={handleViewCustomer} />
            </TabsContent>
            <TabsContent value="lost" className="mt-4">
              <ClosedTable rows={s.lostRows} kind="lost" isLoading={s.isLoading} hasActiveSearch={searching} onClearSearch={() => s.setSearch("")} />
            </TabsContent>
          </Tabs>
        )}

      </PageContainer>
    </PageTransition>
  );
}
