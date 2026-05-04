import { ReactNode, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/SortableTableHead";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { MobileCardList } from "@/components/MobileCardList";
import { useSort } from "@/hooks/useSort";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type ColumnAlign = "left" | "right" | "center";

export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  /** Cuando true, se vuelve clickeable y participa en useSort. */
  sortable?: boolean;
  /** Accessor opcional para el sort (default: item[key]). */
  accessor?: (item: T) => unknown;
  render: (item: T, index: number) => ReactNode;
  align?: ColumnAlign;
  className?: string;
  headClassName?: string;
  /** Oculta esta columna en breakpoints pequeños (sm). */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
  /** Si se provee, en mobile se renderiza con MobileCardList. */
  mobileCardRender?: (item: T) => ReactNode;
  /** Sort por defecto opcional. */
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  /** Footer opcional (totales, etc.). */
  footer?: ReactNode;
  className?: string;
}

const alignClass: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T>({
  columns,
  data,
  isLoading,
  keyExtractor,
  emptyMessage = "Sin resultados",
  onRowClick,
  rowClassName,
  mobileCardRender,
  defaultSortKey,
  defaultSortDirection = "asc",
  footer,
  className,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();

  const accessors = useMemo(() => {
    const map: Record<string, (item: T) => unknown> = {};
    for (const c of columns) if (c.accessor) map[c.key] = c.accessor;
    return map;
  }, [columns]);

  const { sortKey, sortDirection, toggleSort, sortedItems } = useSort<T>(data, {
    defaultKey: defaultSortKey,
    defaultDirection: defaultSortDirection,
    accessors,
  });

  const items = sortedItems ?? [];

  if (isLoading) return <TableSkeleton columnCount={columns.length} rows={5} />;

  if (isMobile && mobileCardRender) {
    return (
      <MobileCardList
        items={items}
        keyExtractor={(item) => keyExtractor(item, 0)}
        emptyMessage={emptyMessage}
        renderCard={mobileCardRender}
      />
    );
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((col) =>
            col.sortable ? (
              <SortableTableHead
                key={col.key}
                sortKey={col.key}
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
                className={cn(alignClass[col.align ?? "left"], col.hideOnMobile && "hidden md:table-cell", col.headClassName)}
              >
                {col.label}
              </SortableTableHead>
            ) : (
              <TableHead
                key={col.key}
                className={cn(alignClass[col.align ?? "left"], col.hideOnMobile && "hidden md:table-cell", col.headClassName)}
              >
                {col.label}
              </TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <EmptyRow colSpan={columns.length} message={emptyMessage} />
        ) : (
          items.map((item, idx) => (
            <TableRow
              key={keyExtractor(item, idx)}
              className={cn(onRowClick && "cursor-pointer", rowClassName?.(item))}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(alignClass[col.align ?? "left"], col.hideOnMobile && "hidden md:table-cell", col.className)}
                >
                  {col.render(item, idx)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
      {footer}
    </Table>
  );
}
