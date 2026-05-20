import type { ColumnDef, RowData } from "@tanstack/react-table";

export type { ColumnDef };

export type ColumnAlign = "left" | "right" | "center";

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
