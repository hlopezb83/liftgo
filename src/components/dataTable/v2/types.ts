import type { LiftgoTableFeatures } from "./features";
import type {
  ColumnDef as TanstackColumnDef,
  Header as TanstackHeader,
  ReactTable,
  Row as TanstackRow,
  RowData,
  TableFeatures,
} from "@tanstack/react-table";

export type ColumnDef<T extends RowData> = TanstackColumnDef<LiftgoTableFeatures, T>;
export type LiftgoTable<T extends RowData> = ReactTable<LiftgoTableFeatures, T>;
export type LiftgoRow<T extends RowData> = TanstackRow<LiftgoTableFeatures, T>;
export type LiftgoHeader<T extends RowData> = TanstackHeader<LiftgoTableFeatures, T>;

export type ColumnAlign = "left" | "right" | "center";

/** R21 C-1: tipo semántico de columna — define alineación, fuente y formato por defecto. */
export type ColumnKind = "text" | "number" | "money" | "date" | "badge";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TFeatures extends TableFeatures, TData extends RowData, TValue> {
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
