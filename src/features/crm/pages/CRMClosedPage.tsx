import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Search } from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DataTableV2, useLiftgoTable, type ColumnDef } from "@/components/dataTable/v2";
import { useCRMMetrics } from "../hooks/useCRMMetrics";
import { useUpdateProspect, type Prospect } from "../hooks/useProspects";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { LOST_REASON_LABELS } from "../lib/constants";

type ClosedKind = "won" | "lost";

function buildColumns(kind: ClosedKind, onReopen: (p: Prospect) => void): ColumnDef<Prospect>[] {
  const base: ColumnDef<Prospect>[] = [
    {
      id: "companyName",
      header: "Empresa",
      accessorKey: "companyName",
      cell: ({ row }) => <span className="font-medium">{row.original.companyName}</span>,
    },
    {
      id: "contactPerson",
      header: "Contacto",
      accessorFn: (p) => p.contactPerson ?? "",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.contactPerson ?? "—"}</span>
      ),
    },
    {
      id: "value",
      header: "Valor",
      accessorFn: (p) => p.finalAmount ?? p.dealValue ?? 0,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums font-mono">
          {formatCurrency(row.original.finalAmount ?? row.original.dealValue ?? 0)}
        </span>
      ),
    },
    {
      id: "closedAt",
      header: "Fecha cierre",
      accessorFn: (p) => (p.closedAt ? new Date(p.closedAt).getTime() : 0),
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.closedAtLabel ?? "—"}</span>
      ),
    },
    {
      id: "createdByName",
      header: "Vendedor",
      accessorFn: (p) => p.createdByName ?? "",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.createdByName ?? "—"}</span>
      ),
    },
  ];

  if (kind === "lost") {
    base.push({
      id: "lostReason",
      header: "Razón",
      accessorFn: (p) => p.lostReason ?? "",
      cell: ({ row }) => {
        const reason = row.original.lostReason;
        return (
          <Badge variant="outline">
            {reason ? LOST_REASON_LABELS[reason] ?? reason : "—"}
          </Badge>
        );
      },
      enableSorting: false,
    });
  }

  base.push({
    id: "actions",
    header: "",
    enableSorting: false,
    meta: { headClassName: "w-[120px]" },
    cell: ({ row }) => (
      <Button size="sm" variant="ghost" onClick={() => onReopen(row.original)}>
        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reabrir
      </Button>
    ),
  });

  return base;
}

interface ClosedTableProps {
  rows: Prospect[];
  kind: ClosedKind;
  isLoading: boolean;
  onReopen: (p: Prospect) => void;
}

function ClosedTable({ rows, kind, isLoading, onReopen }: ClosedTableProps) {
  const columns = useMemo(() => buildColumns(kind, onReopen), [kind, onReopen]);
  const table = useLiftgoTable<Prospect>({
    data: rows,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "closedAt", desc: true }],
  });

  return (
    <DataTableV2
      table={table}
      isLoading={isLoading}
      emptyMessage="Sin registros."
    />
  );
}

export default function CRMClosedPage() {
  const { data: metrics, isLoading } = useCRMMetrics();
  const updateProspect = useUpdateProspect();
  const [search, setSearch] = useState("");
  const [reopenTarget, setReopenTarget] = useState<Prospect | null>(null);

  const filterRows = useCallback((rows: Prospect[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.companyName.toLowerCase().includes(q) ||
        (p.contactPerson ?? "").toLowerCase().includes(q)
    );
  }, [search]);

  const wonRows = useMemo(() => filterRows(metrics.won), [metrics.won, filterRows]);
  const lostRows = useMemo(() => filterRows(metrics.lost), [metrics.lost, filterRows]);

  const handleReopen = useCallback((p: Prospect) => setReopenTarget(p), []);

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
            <ClosedTable rows={wonRows} kind="won" isLoading={isLoading} onReopen={handleReopen} />
          </TabsContent>
          <TabsContent value="lost" className="mt-4">
            <ClosedTable rows={lostRows} kind="lost" isLoading={isLoading} onReopen={handleReopen} />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={reopenTarget !== null} onOpenChange={(open) => !open && setReopenTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir deal</AlertDialogTitle>
            <AlertDialogDescription>
              {reopenTarget ? `¿Reabrir deal con ${reopenTarget.companyName}? Volverá a la columna de Negociación.` : ""}
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
