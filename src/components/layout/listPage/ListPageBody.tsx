import { ReactNode } from "react";
import { DataTablePaginationV2 } from "@/components/dataTable/v2/DataTablePaginationV2";
import type { LiftgoTable } from "@/components/dataTable/v2/types";
import { type LucideIcon } from "@/components/icons";
import { LoadMoreButton, type LoadMoreProps } from "@/components/layout/listPage/LoadMoreFooter";
import { TableContent } from "@/components/layout/listPage/TableContent";
import { Card, CardContent } from "@/components/ui/card";

interface Props<T extends { id?: string }> {
  customContent?: ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  showEmpty: boolean;
  showMobileCards: boolean;
  items: T[];
  table?: LiftgoTable<T>;
  hasMoreRows?: boolean;
  rowCount?: number;
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

function shouldUseMobileCards(showMobileCards: boolean, isLoading: boolean, isError: boolean, showEmpty: boolean) {
  return showMobileCards && !isLoading && !isError && !showEmpty;
}

function shouldShowLoadMore(loadMore: LoadMoreProps | undefined, isError: boolean, isLoading: boolean) {
  return !!loadMore?.hasMore && !isError && !isLoading;
}

function shouldUseCustomContent(content: ReactNode, isLoading: boolean, isError: boolean, showEmpty: boolean) {
  return !!content && !isLoading && !isError && !showEmpty;
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
  hasMoreRows = false,
  rowCount,
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
  if (shouldUseCustomContent(customContent, isLoading, isError, showEmpty)) return <>{customContent}</>;

  const hasPagination = items.length > 0 && !!table;
  // A local filter may match no rows on the first server page. Keep the next
  // page reachable so a matching older record is not stranded behind EmptyState.
  const showLoadMore = shouldShowLoadMore(loadMore, isError, isLoading);
  const mobileCardsReady = shouldUseMobileCards(showMobileCards, isLoading, isError, showEmpty);

  const body = (
    <>
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
      {hasPagination && !isError && !isLoading && (
        <div className={mobileCardsReady ? "rounded-lg border bg-card py-3" : undefined}>
          <DataTablePaginationV2
            table={table}
            hasMoreRows={hasMoreRows}
            rowCount={rowCount}
            action={showLoadMore && loadMore ? <LoadMoreButton {...loadMore} /> : undefined}
          />
        </div>
      )}
      {!hasPagination && showLoadMore && loadMore && (
        <div className="flex justify-center border-t px-4 py-3">
          <LoadMoreButton {...loadMore} />
        </div>
      )}
    </>
  );

  if (mobileCardsReady) return <div className="space-y-3">{body}</div>;

  return <Card><CardContent className="p-0">{body}</CardContent></Card>;
}
