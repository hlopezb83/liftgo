import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResetIcon } from "@/components/icons";
import type { ColumnDef } from "@/components/dataTable/v2";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { LOST_REASON_LABELS } from "./constants";
import type { Prospect } from "../hooks/useProspects";

export type ClosedKind = "won" | "lost";

/**
 * Definición de columnas de la tabla de deals cerrados (ganados/perdidos).
 * Extraído de `CRMClosedPage.tsx` para mantener la página como orquestador puro.
 */
export function buildClosedColumns(
  kind: ClosedKind,
  onReopen: (p: Prospect) => void,
): ColumnDef<Prospect>[] {
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
        <ResetIcon className="h-3.5 w-3.5 mr-1" /> Reabrir
      </Button>
    ),
  });

  return base;
}
