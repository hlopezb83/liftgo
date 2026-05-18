import type { ReactNode } from "react";
import type { ColumnAlign } from "./sorting";

export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  accessor?: (item: T) => unknown;
  render: (item: T, index: number) => ReactNode;
  align?: ColumnAlign;
  className?: string;
  headClassName?: string;
  hideOnMobile?: boolean;
}

export interface DataTableSelectionContext<T> {
  selectedIds: string[];
  selectedRows: T[];
  clearSelection: () => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
  mobileCardRender?: (item: T) => ReactNode;
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  footer?: ReactNode;
  className?: string;
  // --- Selección múltiple (opt-in) ---
  enableRowSelection?: boolean;
  isRowSelectable?: (item: T) => boolean;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
  selectionToolbar?: (ctx: DataTableSelectionContext<T>) => ReactNode;
}
