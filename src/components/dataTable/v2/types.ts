import type { ColumnDef, RowData } from "@tanstack/react-table";

export type { ColumnDef };

export type ColumnAlign = "left" | "right" | "center";

/** R21 C-1: tipo semántico de columna — define alineación, fuente y formato por defecto. */
export type ColumnKind = "text" | "number" | "money" | "date" | "badge";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: ColumnAlign;
    /** Tipo semántico; DataTableV2 aplica align + font-mono/tabular-nums automáticamente. */
    kind?: ColumnKind;
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
