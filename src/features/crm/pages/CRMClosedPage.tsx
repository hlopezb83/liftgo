import { Link } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useClosedProspects } from "../hooks/useClosedProspects";
import { ClosedTable } from "../components/closed/ClosedTable";

export default function CRMClosedPage() {
  const s = useClosedProspects();

  return (
    <PageTransition>
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/crm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Pipeline
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Histórico de Deals Cerrados</h1>
              <p className="text-xs text-muted-foreground">
                Win rate 30d: <span className="font-semibold">{s.metrics.winRate30d}%</span> ·
                Ganados mes: <span className="font-semibold">{s.metrics.wonCountMTD} · {formatCurrency(s.metrics.wonTotalMTD)}</span> ·
                Perdidos mes: <span className="font-semibold">{s.metrics.lostCountMTD}</span>
              </p>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={s.search}
              onChange={(e) => s.setSearch(e.target.value)}
              placeholder="Buscar empresa o contacto…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

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
      </div>

      <AlertDialog open={s.reopenTarget !== null} onOpenChange={(open) => !open && s.setReopenTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir deal</AlertDialogTitle>
            <AlertDialogDescription>
              {s.reopenTarget ? `¿Reabrir deal con ${s.reopenTarget.companyName}? Volverá a la columna de Negociación.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={s.confirmReopen}>Reabrir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
