import {
  useTable,
  type SortingState,
  type RowSelectionState,
  type PaginationState,
  type RowData,
  type Updater,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { APP_CONFIG } from "@/lib/config";
import { liftgoTableFeatures } from "./features";
import { createLiftgoSortingFn } from "./sorting";
import type { ColumnDef, DataTableSelectionContext, LiftgoTable } from "./types";

interface Options<T extends RowData> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  getRowId: (row: T, index: number) => string;
  initialSorting?: SortingState;
  initialPageSize?: number;
  enableRowSelection?: boolean | ((row: T) => boolean);
  enableSorting?: boolean;
  globalFilter?: string;
  paginated?: boolean;
  resetKey?: string | number;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
}

/**
 * Hook único para tablas LiftGo. TanStack v9 administra el estado de sort, filtro,
 * paginación y selección con los row models registrados en features.
 */
export function useLiftgoTable<T extends RowData>({
  data,
  columns,
  getRowId,
  initialSorting = [],
  initialPageSize = APP_CONFIG.PAGE_SIZE,
  enableRowSelection = false,
  enableSorting = true,
  globalFilter,
  paginated = true,
  resetKey,
  onSelectionChange,
}: Options<T>): LiftgoTable<T> {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const tableData = useMemo(() => data ?? [], [data]);

  // El contenido determina cuándo volver a la primera página; las listas derivan
  // arreglos nuevos con frecuencia y su referencia sola no sirve.
  const dataVersion = useMemo(
    () => tableData.map((r) => JSON.stringify(r)).join("|"),
    [tableData],
  );
  const [paginationSnapshot, setPaginationSnapshot] = useState(() => ({
    dataVersion,
    resetKey,
    value: { pageIndex: 0, pageSize: initialPageSize } as PaginationState,
  }));
  const paginationIsCurrent =
    paginationSnapshot.dataVersion === dataVersion && paginationSnapshot.resetKey === resetKey;
  const pagination = paginationIsCurrent
    ? paginationSnapshot.value
    : { ...paginationSnapshot.value, pageIndex: 0 };
  const handlePaginationChange = (updater: Updater<PaginationState>): void => {
    setPaginationSnapshot((previous) => {
      const current = previous.dataVersion === dataVersion && previous.resetKey === resetKey
        ? previous.value
        : { ...previous.value, pageIndex: 0 };
      return {
        dataVersion,
        resetKey,
        value: typeof updater === "function" ? updater(current) : updater,
      };
    });
  };

  // R22-W: nulos siempre al final, también al invertir a `desc`.
  const sortingFnWithNullsLast = useMemo(
    () => createLiftgoSortingFn<T>((columnId, row) =>
      row.table.atoms.sorting.get().some((item) => item.id === columnId && item.desc)),
    [],
  );

  const resolveSelectable =
    typeof enableRowSelection === "function"
      ? (row: { original: T }): boolean => {
          const fn: (r: T) => boolean = enableRowSelection;
          return fn(row.original);
        }
      : enableRowSelection;

  const handleSelectionChange = (updater: Updater<RowSelectionState>): void => {
    setRowSelection((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (onSelectionChange) {
        const ids = Object.keys(next).filter((k) => next[k]);
        const rows = tableData.filter((r, i) => ids.includes(getRowId(r, i)));
        onSelectionChange({
          selectedIds: ids,
          selectedRows: rows,
          clearSelection: () => setRowSelection({}),
        });
      }
      return next;
    });
  };

  const table = useTable<typeof liftgoTableFeatures, T>({
    features: liftgoTableFeatures,
    autoResetPageIndex: false,
    data: tableData,
    columns,
    defaultColumn: { sortFn: sortingFnWithNullsLast, sortUndefined: "last" },
    state: {
      sorting,
      rowSelection,
      ...(paginated ? { pagination } : {}),
      ...(globalFilter !== undefined ? { globalFilter } : {}),
    },
    onSortingChange: setSorting,
    onRowSelectionChange: handleSelectionChange,
    onPaginationChange: paginated ? handlePaginationChange : undefined,
    enableRowSelection: resolveSelectable,
    enableSorting,
    getRowId,
    manualPagination: !paginated,
  });

  // v9 devuelve una referencia React actualizada con el estado y compatible con el Compiler.
  return table;
}
