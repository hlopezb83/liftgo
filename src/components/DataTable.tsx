import { ReactNode, useMemo, memo } from "react";
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
  sortable?: boolean;
  accessor?: (item: T) => unknown;
  render: (item: T, index: number) => ReactNode;
  align?: ColumnAlign;
  className?: string;
  headClassName?: string;
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
  mobileCardRender?: (item: T) => ReactNode;
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  footer?: ReactNode;
  className?: string;
}

const alignClass: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

interface DataTableRowProps<T> {
  item: T;
  index: number;
  columns: DataTableColumn<T>[];
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
}

function DataTableRowInner<T>({ item, index, columns, onRowClick, rowClassName }: DataTableRowProps<T>) {
  return (
    <TableRow
      className={cn(onRowClick && "cursor-pointer", rowClassName?.(item))}
      onClick={onRowClick ? () => onRowClick(item) : undefined}
    >
      {columns.map((col) => (
        <TableCell
          key={col.key}
          className={cn(alignClass[col.align ?? "left"], col.hideOnMobile && "hidden md:table-cell", col.className)}
        >
          {col.render(item, index)}
        </TableCell>
      ))}
    </TableRow>
  );
}

const DataTableRow = memo(DataTableRowInner) as typeof DataTableRowInner;

function DataTableInner<T>({
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

  // Stable signature based on column keys to avoid invalidating accessors when
  // a parent passes inline `columns` arrays whose contents are equivalent.
  const columnsKey = columns.map((c) => c.key).join("|");

  const accessors = useMemo(() => {
    const map: Record<string, (item: T) => unknown> = {};
    for (const c of columns) if (c.accessor) map[c.key] = c.accessor;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsKey]);

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
            <DataTableRow
              key={keyExtractor(item, idx)}
              item={item}
              index={idx}
              columns={columns}
              onRowClick={onRowClick}
              rowClassName={rowClassName}
            />
          ))
        )}
      </TableBody>
      {footer}
    </Table>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
