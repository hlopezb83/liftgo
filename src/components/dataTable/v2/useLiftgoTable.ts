import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type PaginationState,
  type Table,
  type Updater,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { APP_CONFIG } from "@/lib/config";
import { liftgoSortingFn } from "./sorting";
import type { DataTableSelectionContext } from "./types";

interface Options<T> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  getRowId: (row: T, index: number) => string;
  initialSorting?: SortingState;
  initialPageSize?: number;
  enableRowSelection?: boolean | ((row: T) => boolean);
  globalFilter?: string;
  paginated?: boolean;
  resetKey?: string | number;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
}

/**
 * Hook único para tablas LiftGo. Todo el estado (sort, filtro, paginación,
 * selección) lo administra TanStack. Sin `useEffect`s para sincronizar
 * arreglos: el sort lo hace `getSortedRowModel`, el filtro `getFilteredRowModel`,
 * la paginación `getPaginationRowModel`, y la selección la poda TanStack
 * automáticamente al cambiar `data` si `getRowId` es estable.
 */
export function useLiftgoTable<T>({
  data,
  columns,
  getRowId,
  initialSorting = [],
  initialPageSize = APP_CONFIG.PAGE_SIZE,
  enableRowSelection = false,
  globalFilter,
  paginated = true,
  resetKey,
  onSelectionChange,
}: Options<T>): Table<T> {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const tableData = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [tableData, resetKey]);

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

  // `useReactTable` retorna una API imperativa que muta internamente; el Proxy
  // de la línea 120 restablece identidad para el compiler. Ver comentario abajo.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<T>({
    autoResetPageIndex: false,
    data: tableData,
    columns,
    defaultColumn: { sortingFn: liftgoSortingFn },
    state: {
      sorting,
      rowSelection,
      ...(paginated ? { pagination } : {}),
      ...(globalFilter !== undefined ? { globalFilter } : {}),
    },
    onSortingChange: setSorting,
    onRowSelectionChange: handleSelectionChange,
    onPaginationChange: paginated ? setPagination : undefined,
    enableRowSelection: resolveSelectable,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
  });

  // React Compiler + TanStack Table: `useReactTable` retorna la MISMA referencia
  // en cada render (muta internamente). Sin cambio de identidad, el compiler
  // memoiza el JSX aguas abajo y las tablas no se actualizan al filtrar/sortear.
  // Envolvemos con Proxy transparente cuya identidad cambia con `data`, estado
  // de sort/paginación y selección para invalidar la memoización de forma segura.
  // R12 A1: versionar por identidad de filas (no por longitud). Con misma
  // longitud + distinto contenido, `.length` no cambia y el memo aguas abajo
  // servía JSX viejo (visible al filtrar por texto que devolvía el mismo #
  // de filas). Ahora el hash cambia al cambiar el contenido.
  const dataVersion = tableData
    .map((r: unknown) => {
      const rec = r as { id?: string | number } | null | undefined;
      return rec?.id ?? JSON.stringify(r);
    })
    .join("|");
  const sortKey = sorting.map((s) => `${s.id}:${s.desc ? "d" : "a"}`).join(",");
  const selKey = Object.keys(rowSelection).length;
  const pagKey = paginated ? `${pagination.pageIndex}:${pagination.pageSize}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Proxy(table, {}), [table, dataVersion, sortKey, selKey, pagKey]);
}
