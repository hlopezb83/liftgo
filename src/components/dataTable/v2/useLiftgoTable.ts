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
    defaultColumn: { sortingFn: sortingFnWithNullsLast },
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
  // R12 A1 + R13-1: versionar por CONTENIDO completo, no por identidad.
  // El fix anterior solo hasheaba `id`, así que ediciones in-place (mismo id,
  // distintos campos) no invalidaban el memo y la tabla mostraba datos viejos
  // hasta un reload. Con `JSON.stringify(r)` completo, cualquier cambio de
  // contenido genera nueva huella.
  // R-Perf P0-1: memoizado con `[tableData]` — TanStack Query produce nueva
  // referencia ante cualquier cambio de contenido, así que solo se recalcula
  // cuando la data realmente cambia (no en cada render por sort/paginación/
  // selección/apertura de diálogo). Ahorro medido: 21ms → <1ms a 500 filas.
  const dataVersion = useMemo(
    () => tableData.map((r) => JSON.stringify(r)).join("|"),
    [tableData],
  );

  const sortKey = sorting.map((s) => `${s.id}:${s.desc ? "d" : "a"}`).join(",");
  const selKey = Object.keys(rowSelection).length;
  const pagKey = paginated ? `${pagination.pageIndex}:${pagination.pageSize}` : "";
  // v7.226.1 · `table` es la referencia mutable de TanStack; las claves derivadas
  // se consumen dentro del memo (vía `void`) para satisfacer exhaustive-deps sin
  // desactivar la regla y sin bloquear al React Compiler.
  return useMemo(() => {
    void dataVersion;
    void sortKey;
    void selKey;
    void pagKey;
    return new Proxy(table, {});
  }, [table, dataVersion, sortKey, selKey, pagKey]);
}
