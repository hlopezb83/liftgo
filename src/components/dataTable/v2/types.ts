import type {
  ColumnDef,
  SortingState,
  RowSelectionState,
  PaginationState,
  Table as TanstackTable,
  Row,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> extends LiftgoColumnMeta {}
}

export interface DataTableSelectionContext<T> {
  selectedIds: string[];
  selectedRows: T[];
  clearSelection: () => void;
}
