
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { buildClosedColumns, type ClosedKind } from "../../lib/closedColumns";
import type { Prospect } from "../../hooks/useProspects";

interface ClosedTableProps {
  rows: Prospect[];
  kind: ClosedKind;
  isLoading: boolean;
  onReopen: (p: Prospect) => void;
}

/**
 * Tabla de deals cerrados (ganados/perdidos). UI pura: recibe filas filtradas
 * y callbacks. La columna `lostReason` aparece solo cuando `kind === "lost"`.
 */
export function ClosedTable({ rows, kind, isLoading, onReopen }: ClosedTableProps) {
  const columns = buildClosedColumns(kind, onReopen);
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
