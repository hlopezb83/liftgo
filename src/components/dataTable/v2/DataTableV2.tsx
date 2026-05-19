import { memo, type ReactNode } from "react";
import type { Table as TanstackTable } from "@tanstack/react-table";
import { Table } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { MobileCardList } from "@/components/MobileCardList";
import { useIsMobile } from "@/hooks/use-mobile";
import { DataTableHeaderV2 } from "./DataTableHeaderV2";
import { DataTableBodyV2 } from "./DataTableBodyV2";
import { VirtualBody } from "./VirtualBody";
import type { DataTableSelectionContext } from "./types";

interface Props<T> {
  table: TanstackTable<T>;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
  mobileCardRender?: (item: T) => ReactNode;
  footer?: ReactNode;
  className?: string;
  enableRowSelection?: boolean;
  selectionToolbar?: (ctx: DataTableSelectionContext<T>) => ReactNode;
  virtualized?: boolean;
  virtualizationThreshold?: number;
}

function buildToolbar<T>(
  table: TanstackTable<T>,
  enabled: boolean,
  render: ((ctx: DataTableSelectionContext<T>) => ReactNode) | undefined,
): ReactNode {
  if (!enabled || !render) return null;
  const sel = table.getState().rowSelection;
  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  if (selectedIds.length === 0) return null;
  const ctx: DataTableSelectionContext<T> = {
    selectedIds,
    selectedRows: table.getSelectedRowModel().rows.map((r) => r.original),
    clearSelection: () => table.resetRowSelection(),
  };
  return render(ctx);
}

function Inner<T>({
  table,
  isLoading,
  emptyMessage = "Sin resultados",
  onRowClick,
  rowClassName,
  mobileCardRender,
  footer,
  className,
  enableRowSelection = false,
  selectionToolbar,
  virtualized = false,
  virtualizationThreshold = 100,
}: Props<T>) {
  const isMobile = useIsMobile();
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  if (isLoading) return <TableSkeleton columnCount={columnCount} rows={5} />;

  if (isMobile && mobileCardRender) {
    const items = rows.map((r) => r.original);
    return (
      <MobileCardList
        items={items}
        keyExtractor={(item) => rows.find((r) => r.original === item)?.id ?? ""}
        emptyMessage={emptyMessage}
        renderCard={mobileCardRender}
      />
    );
  }

  const toolbar = buildToolbar(table, enableRowSelection, selectionToolbar);
  const useVirtual = virtualized && rows.length > virtualizationThreshold;
  const bodyProps = {
    rows,
    columnCount,
    emptyMessage,
    showSelection: enableRowSelection,
    onRowClick,
    rowClassName,
  };

  return (
    <div className="space-y-2">
      {toolbar}
      <Table className={className}>
        <DataTableHeaderV2 table={table} showSelection={enableRowSelection} />
        {useVirtual ? <VirtualBody {...bodyProps} /> : <DataTableBodyV2 {...bodyProps} />}
        {footer}
      </Table>
    </div>
  );
}

export const DataTableV2 = memo(Inner) as typeof Inner;
