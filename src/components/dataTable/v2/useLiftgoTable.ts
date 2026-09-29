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
  /** Conserva la página al anexar filas sin alterar las ya cargadas. */
  preservePaginationOnAppend?: boolean;
  /** Estado de paginación controlado para páginas obtenidas en el servidor. */
  controlledPagination?: PaginationState;
  onControlledPaginationChange?: (updater: Updater<PaginationState>) => void;
  /** Conteo remoto. Si se define, TanStack usa paginación manual. */
  pageCount?: number;
  /** Estado de orden controlado para listas ordenadas por el servidor. */
  controlledSorting?: SortingState;
  onControlledSortingChange?: (updater: Updater<SortingState>) => void;
  manualSorting?: boolean;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
}

function canKeepPaginationData(previous: string, current: string, preserveAppend: boolean): boolean {
  return previous === current ||
    (preserveAppend && previous !== "" && current.startsWith(`${previous}|`));
}

function isPaginationCurrent<T extends RowData>(
  snapshot: { dataVersion: string; resetKey: string | number | undefined },
  dataVersion: string,
  resetKey: string | number | undefined,
  preserveAppend: boolean,
): boolean {
  return canKeepPaginationData(snapshot.dataVersion, dataVersion, preserveAppend) && snapshot.resetKey === resetKey;
}

function resolveSelectable<T extends RowData>(
  setting: boolean | ((row: T) => boolean),
): boolean | ((row: { original: T }) => boolean) {
  if (typeof setting !== "function") return setting;
  return (row) => setting(row.original);
}

function buildTableState<T extends RowData>(args: {
  sorting: SortingState;
  rowSelection: RowSelectionState;
  pagination: PaginationState;
  controlledPagination?: PaginationState;
  paginated: boolean;
  globalFilter?: string;
}) {
  const state = { sorting: args.sorting, rowSelection: args.rowSelection } as {
    sorting: SortingState;
    rowSelection: RowSelectionState;
    pagination?: PaginationState;
    globalFilter?: string;
  };
  if (args.controlledPagination) state.pagination = args.controlledPagination;
  else if (args.paginated) state.pagination = args.pagination;
  if (args.globalFilter !== undefined) state.globalFilter = args.globalFilter;
  return state;
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
  preservePaginationOnAppend = false,
  controlledPagination,
  onControlledPaginationChange,
  pageCount,
  controlledSorting,
  onControlledSortingChange,
  manualSorting = false,
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
  const paginationIsCurrent = isPaginationCurrent(paginationSnapshot, dataVersion, resetKey, preservePaginationOnAppend);
  const pagination = paginationIsCurrent
    ? paginationSnapshot.value
    : { ...paginationSnapshot.value, pageIndex: 0 };
  const effectiveSorting = controlledSorting ?? sorting;
  const handlePaginationChange = (updater: Updater<PaginationState>): void => {
    setPaginationSnapshot((previous) => {
      const current = canKeepPaginationData(previous.dataVersion, dataVersion, preservePaginationOnAppend) &&
        previous.resetKey === resetKey
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

  const selectable = resolveSelectable(enableRowSelection);

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

  const handleSortingChange = (updater: Updater<SortingState>): void => {
    if (onControlledSortingChange) {
      onControlledSortingChange(updater);
      return;
    }
    setSorting((previous) => typeof updater === "function" ? updater(previous) : updater);
  };

  const handleServerPaginationChange = (updater: Updater<PaginationState>): void => {
    if (onControlledPaginationChange) {
      onControlledPaginationChange(updater);
      return;
    }
    handlePaginationChange(updater);
  };

  const table = useTable<typeof liftgoTableFeatures, T>({
    features: liftgoTableFeatures,
    autoResetPageIndex: false,
    data: tableData,
    columns,
    defaultColumn: { sortFn: sortingFnWithNullsLast, sortUndefined: "last" },
    state: buildTableState({
      sorting: effectiveSorting,
      rowSelection,
      pagination,
      controlledPagination,
      paginated,
      globalFilter,
    }),
    onSortingChange: handleSortingChange,
    onRowSelectionChange: handleSelectionChange,
    onPaginationChange: paginated ? handleServerPaginationChange : undefined,
    enableRowSelection: selectable,
    enableSorting,
    getRowId,
    manualSorting,
    manualPagination: !paginated || pageCount !== undefined,
    ...(pageCount !== undefined ? { pageCount } : {}),
  });

  // v9 devuelve una referencia React actualizada con el estado y compatible con el Compiler.
  return table;
}
