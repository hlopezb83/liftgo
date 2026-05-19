import type {
  ColumnDef,
  SortingState,
  RowSelectionState,
  PaginationState,
  Table as TanstackTable,
  Row,
  RowData,
} from "@tanstack/react-table";

export type {
  ColumnDef,
  SortingState,
  RowSelectionState,
  PaginationState,
  TanstackTable,
  Row,
};

export type ColumnAlign = "left" | "right" | "center";

/**
 * Metadata específica de LiftGo para columnas TanStack.
 * Se accede vía `column.columnDef.meta`.
 */
export interface LiftgoColumnMeta {
  align?: ColumnAlign;
  hideOnMobile?: boolean;
  headClassName?: string;
  cellClassName?: string;
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: ColumnAlign;
    hideOnMobile?: boolean;
    headClassName?: string;
    cellClassName?: string;
  }
}

export interface DataTableSelectionContext<T> {
  selectedIds: string[];
  selectedRows: T[];
  clearSelection: () => void;
}
