import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Search } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCRMMetrics } from "@/features/crm/hooks/useCRMMetrics";
import { useUpdateProspect, type Prospect } from "@/features/crm/hooks/useProspects";
import { formatCurrency } from "@/lib/formatCurrency";
import { LOST_REASON_LABELS } from "@/features/crm/lib/constants";
import { format } from "date-fns";
import { es } from "date-fns/locale";

function ClosedTable({ rows, kind, onReopen }: { rows: Prospect[]; kind: "won" | "lost"; onReopen: (p: Prospect) => void }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sin registros.</p>;
  }
  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Fecha cierre</TableHead>
            <TableHead>Vendedor</TableHead>
            {kind === "lost" && <TableHead>Razón</TableHead>}
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p, i) => (
            <TableRow key={p.id} className={i % 2 === 0 ? "bg-muted/20" : ""}>
              <TableCell className="font-medium">{p.company_name}</TableCell>
              <TableCell className="text-muted-foreground">{p.contact_person ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(p.final_amount ?? p.deal_value ?? 0)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {p.closed_at ? format(new Date(p.closed_at), "dd MMM yyyy", { locale: es }) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{p.created_by_name ?? "—"}</TableCell>
              {kind === "lost" && (
                <TableCell>
                  <Badge variant="outline">{p.lost_reason ? LOST_REASON_LABELS[p.lost_reason] ?? p.lost_reason : "—"}</Badge>
                </TableCell>
              )}
              <TableCell>
                <Button size="sm" variant="ghost" onClick={() => onReopen(p)}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reabrir
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CRMClosedPage() {
  const { data: metrics, isLoading } = useCRMMetrics();
  const updateProspect = useUpdateProspect();
  const [search, setSearch] = useState("");
  const [reopenTarget, setReopenTarget] = useState<Prospect | null>(null);

  const filterRows = useCallback((rows: Prospect[]) => {
    const q = search.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => {
      const da = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const db = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return db - da;
    });
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.company_name.toLowerCase().includes(q) ||
        (p.contact_person ?? "").toLowerCase().includes(q)
    );
  }, [search]);

  const wonRows = useMemo(() => filterRows(metrics.won), [metrics.won, filterRows]);
  const lostRows = useMemo(() => filterRows(metrics.lost), [metrics.lost, filterRows]);

  const handleReopen = (p: Prospect) => setReopenTarget(p);

  const confirmReopen = () => {
    if (!reopenTarget) return;
    updateProspect.mutate({ id: reopenTarget.id, stage: "negociacion" });
    setReopenTarget(null);
  };

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
                Win rate 30d: <span className="font-semibold">{metrics.winRate30d}%</span> ·
                Ganados mes: <span className="font-semibold">{metrics.wonCountMTD} · {formatCurrency(metrics.wonTotalMTD)}</span> ·
                Perdidos mes: <span className="font-semibold">{metrics.lostCountMTD}</span>
              </p>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa o contacto…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <Tabs defaultValue="won">
          <TabsList>
            <TabsTrigger value="won">Ganados ({metrics.won.length})</TabsTrigger>
            <TabsTrigger value="lost">Perdidos ({metrics.lost.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="won" className="mt-4">
            {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : <ClosedTable rows={wonRows} kind="won" onReopen={handleReopen} />}
          </TabsContent>
          <TabsContent value="lost" className="mt-4">
            {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : <ClosedTable rows={lostRows} kind="lost" onReopen={handleReopen} />}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={reopenTarget !== null} onOpenChange={(open) => !open && setReopenTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir deal</AlertDialogTitle>
            <AlertDialogDescription>
              {reopenTarget ? `¿Reabrir deal con ${reopenTarget.company_name}? Volverá a la columna de Negociación.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReopen}>Reabrir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
