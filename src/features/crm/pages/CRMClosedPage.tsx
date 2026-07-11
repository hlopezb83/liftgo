import { SearchIcon } from "@/components/icons";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useClosedProspects } from "../hooks/useClosedProspects";
import { ClosedTable } from "../components/closed/ClosedTable";

export default function CRMClosedPage() {
  const s = useClosedProspects();

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          title="Histórico de Deals Cerrados"
          subtitle={`Win rate 30d: ${s.metrics.winRate30d}% · Ganados mes: ${s.metrics.wonCountMTD} (${formatCurrency(s.metrics.wonTotalMTD)}) · Perdidos mes: ${s.metrics.lostCountMTD}`}
          backHref="/crm"
          backLabel="Pipeline"
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

        <Tabs defaultValue="won">
          <TabsList>
            <TabsTrigger value="won">Ganados ({s.metrics.won.length})</TabsTrigger>
            <TabsTrigger value="lost">Perdidos ({s.metrics.lost.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="won" className="mt-4">
            <ClosedTable rows={s.wonRows} kind="won" isLoading={s.isLoading} onReopen={s.handleReopen} />
          </TabsContent>
          <TabsContent value="lost" className="mt-4">
            <ClosedTable rows={s.lostRows} kind="lost" isLoading={s.isLoading} onReopen={s.handleReopen} />
          </TabsContent>
        </Tabs>
      </PageContainer>


      <ConfirmDialog
        open={s.reopenTarget !== null}
        onOpenChange={(open) => !open && s.setReopenTarget(null)}
        title="Reabrir deal"
        description={s.reopenTarget ? `¿Reabrir deal con ${s.reopenTarget.companyName}? Volverá a la columna de Negociación.` : ""}
        confirmLabel="Reabrir"
        onConfirm={s.confirmReopen}
      />
    </PageTransition>
  );
}
