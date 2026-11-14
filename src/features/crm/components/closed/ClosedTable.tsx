
import { DataTableV2, useLiftgoTable } from "@/components/dataTable/v2";
import { EmptyState } from "@/components/feedback/EmptyState";
import { buildClosedColumns, type ClosedKind } from "../../lib/closedColumns";
import type { Prospect } from "../../hooks/useProspects";

interface ClosedTableProps {
  rows: Prospect[];
  kind: ClosedKind;
  isLoading: boolean;
  hasActiveSearch: boolean;
  onClearSearch: () => void;
  onConvert?: (p: Prospect) => void;
  onViewCustomer?: (customerId: string) => void;
}

/**
 * Tabla de deals cerrados (ganados/perdidos). UI pura: recibe filas filtradas
 * y callbacks. La columna `lostReason` aparece solo cuando `kind === "lost"`.
 */
export function ClosedTable({ rows, kind, isLoading, hasActiveSearch, onClearSearch, onConvert, onViewCustomer }: ClosedTableProps) {
  const columns = buildClosedColumns(kind, onConvert, onViewCustomer);
  const table = useLiftgoTable<Prospect>({
    data: rows,
    columns,
    getRowId: (p) => p.id,
    initialSorting: [{ id: "closedAt", desc: true }],
    paginated: false,
  });

  if (!isLoading && rows.length === 0 && hasActiveSearch) {
    return <EmptyState title="No hay prospectos que coincidan con la búsqueda" subtitle="Ajusta o limpia la búsqueda para ver los prospectos." actionLabel="Limpiar búsqueda" onAction={onClearSearch} />;
  }

  return (
    <DataTableV2
      table={table}
      isLoading={isLoading}
      emptyMessage="Sin registros."
    />
  );
}
