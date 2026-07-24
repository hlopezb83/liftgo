import { ReactNode } from "react";
import { DataTablePaginationV2 } from "@/components/dataTable/v2/DataTablePaginationV2";
import { type LucideIcon } from "@/components/icons";
import { LoadMoreFooter, type LoadMoreProps } from "@/components/layout/listPage/LoadMoreFooter";
import { TableContent } from "@/components/layout/listPage/TableContent";
import { Card, CardContent } from "@/components/ui/card";
import type { Table as TanstackTable } from "@tanstack/react-table";

interface Props<T> {
  customContent?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  showEmpty: boolean;
  showMobileCards: boolean;
  items: T[];
  table?: TanstackTable<T>;
  emptyMessage: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
  onRowClick?: (item: T) => void;
  onRowPrefetch?: (item: T) => unknown;
  mobileCardRender?: (item: T) => ReactNode;
  mobileKeyExtractor?: (item: T) => string;
  skeletonColumns?: number;
  loadMore?: LoadMoreProps;
}

/**
 * v7.226.1 · extraído de ListPageLayout para bajar complejidad ciclomática.
 * Renderiza contenido custom o la Card estándar (tabla + paginación + loadMore).
 */
export function ListPageBody<T extends { id?: string }>({
  customContent,
  isLoading,
  isError,
  onRetry,
  showEmpty,
  showMobileCards,
  items,
  table,
  emptyMessage,
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  hasActiveFilters,
  onClearFilters,
  onRowClick,
  onRowPrefetch,
  mobileCardRender,
  mobileKeyExtractor,
  skeletonColumns,
  loadMore,
}: Props<T>) {
  if (customContent) return <>{customContent}</>;

  const hasPagination = items.length > 0 && !!table;
  const showLoadMore = !!loadMore && !isError && !isLoading && items.length > 0;

  return (
    <Card>
      <CardContent className="p-0">
        <TableContent
          isLoading={isLoading}
          isError={isError}
          onRetry={onRetry}
          showEmpty={showEmpty}
          showMobileCards={showMobileCards}
          items={items}
          table={table}
          emptyMessage={emptyMessage}
          emptyIcon={emptyIcon}
          emptyActionLabel={emptyActionLabel}
          onEmptyAction={onEmptyAction}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={onClearFilters}
          onRowClick={onRowClick}
          onRowPrefetch={onRowPrefetch}
          mobileCardRender={mobileCardRender}
          mobileKeyExtractor={mobileKeyExtractor}
          skeletonColumns={skeletonColumns}
        />
        {hasPagination && !isError && <DataTablePaginationV2 table={table} />}
        {showLoadMore && loadMore && <LoadMoreFooter {...loadMore} />}
      </CardContent>
    </Card>
  );
}
