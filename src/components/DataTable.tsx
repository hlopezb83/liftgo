import { memo } from "react";
import { Table } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { MobileCardList } from "@/components/MobileCardList";
import { useIsMobile } from "@/hooks/use-mobile";
import { DataTableHeader } from "./dataTable/DataTableHeader";
import { DataTableBody } from "./dataTable/DataTableBody";
import { useDataTableState } from "./dataTable/useDataTableState";
import type { DataTableProps } from "./dataTable/types";

export type { DataTableColumn, DataTableProps, DataTableSelectionContext } from "./dataTable/types";
export type { ColumnAlign } from "./dataTable/sorting";

function DataTableInner<T>({
  columns,
  data,
  isLoading,
  keyExtractor,
  emptyMessage = "Sin resultados",
  onRowClick,
  rowClassName,
  mobileCardRender,
  defaultSortKey,
  defaultSortDirection = "asc",
  footer,
  className,
  enableRowSelection = false,
  isRowSelectable,
  onSelectionChange,
  selectionToolbar,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const {
    table, sortedRows, sortedItems, selectedIds, selectedRows, clearSelection,
    sortKey, sortDirection, toggleSort, headerCheckedState,
  } = useDataTableState({
    columns, data, keyExtractor, defaultSortKey, defaultSortDirection,
    enableRowSelection, isRowSelectable, onSelectionChange,
  });

  if (isLoading) return <TableSkeleton columnCount={columns.length} rows={5} />;

  if (isMobile && mobileCardRender) {
    return (
      <MobileCardList
        items={sortedItems}
        keyExtractor={(item) => keyExtractor(item, 0)}
        emptyMessage={emptyMessage}
        renderCard={mobileCardRender}
      />
    );
  }

  const toolbar =
    enableRowSelection && selectionToolbar && selectedIds.length > 0
      ? selectionToolbar({ selectedIds, selectedRows, clearSelection })
      : null;

  return (
    <div className="space-y-2">
      {toolbar}
      <Table className={className}>
        <DataTableHeader
          columns={columns}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
          showSelection={enableRowSelection}
          headerCheckedState={headerCheckedState}
          onToggleAll={(value) => table.toggleAllRowsSelected(value)}
        />
        <DataTableBody
          rows={sortedRows}
          columns={columns}
          emptyMessage={emptyMessage}
          showSelection={enableRowSelection}
          onRowClick={onRowClick}
          rowClassName={rowClassName}
        />
        {footer}
      </Table>
    </div>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
