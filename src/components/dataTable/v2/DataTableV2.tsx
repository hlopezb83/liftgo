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
    return (
      <MobileCardList
        items={rows.map((r) => r.original)}
        keyExtractor={(_item) => rows.find((r) => r.original === _item)?.id ?? ""}
        emptyMessage={emptyMessage}
        renderCard={mobileCardRender}
      />
    );
  }

  const selectedIds = Object.keys(table.getState().rowSelection).filter(
    (k) => table.getState().rowSelection[k],
  );
  const toolbarCtx: DataTableSelectionContext<T> = {
    selectedIds,
    selectedRows: table.getSelectedRowModel().rows.map((r) => r.original),
    clearSelection: () => table.resetRowSelection(),
  };
  const toolbar =
    enableRowSelection && selectionToolbar && selectedIds.length > 0
      ? selectionToolbar(toolbarCtx)
      : null;


  const useVirtual = virtualized && rows.length > virtualizationThreshold;

  return (
    <div className="space-y-2">
      {toolbar}
      <Table className={className}>
        <DataTableHeaderV2 table={table} showSelection={enableRowSelection} />
        {useVirtual ? (
          <VirtualBody
            rows={rows}
            columnCount={columnCount}
            emptyMessage={emptyMessage}
            showSelection={enableRowSelection}
            onRowClick={onRowClick}
            rowClassName={rowClassName}
          />
        ) : (
          <DataTableBodyV2
            rows={rows}
            columnCount={columnCount}
            emptyMessage={emptyMessage}
            showSelection={enableRowSelection}
            onRowClick={onRowClick}
            rowClassName={rowClassName}
          />
        )}
        {footer}
      </Table>
    </div>
  );
}

export const DataTableV2 = memo(Inner) as typeof Inner;
