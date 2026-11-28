import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import { useContext, type ReactNode } from "react";
import { DataTableV2 } from "@/components/dataTable/v2/DataTableV2";
import type { LiftgoTable, TableRowAction } from "@/components/dataTable/v2/types";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { FilterIcon, type LucideIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";

export interface TableContentProps<T extends { id?: string }> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  showEmpty: boolean;
  showMobileCards: boolean;
  items: T[];
  table?: LiftgoTable<T>;
  emptyMessage: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  hasActiveFilters: boolean;
  onClearFilters?: () => void;
  onRowClick?: (item: T) => void;
  rowAction?: TableRowAction<T>;
  onRowPrefetch?: (item: T) => unknown;
  mobileCardRender?: (item: T) => ReactNode;
  mobileKeyExtractor?: (item: T) => string;
  skeletonColumns?: number;
}

export function TableContent<T extends { id?: string }>({
  isLoading, isError, error, onRetry, showEmpty, showMobileCards, items, table,
  emptyMessage, emptyIcon, emptyActionLabel, onEmptyAction,
  hasActiveFilters, onClearFilters,
  onRowClick, rowAction, onRowPrefetch, mobileCardRender, mobileKeyExtractor, skeletonColumns,
}: TableContentProps<T>) {
  const queryClient = useContext(QueryClientContext);
  if (isError) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading) return <TableSkeleton columnCount={skeletonColumns} />;
  if (showEmpty) {
    // UX-M6: EmptyState honesto — si hay filtros aplicados no fingimos que no
    // existen registros; ofrecemos limpiar filtros como acción primaria.
    if (hasActiveFilters) {
      return (
        <EmptyState
          icon={emptyIcon ?? FilterIcon}
          title="No hay resultados con los filtros actuales"
          subtitle="Ajusta o limpia los filtros para ver más resultados."
          actionLabel={onClearFilters ? "Limpiar filtros" : undefined}
          onAction={onClearFilters}
        />
      );
    }
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyMessage}
        subtitle="Aún no hay registros aquí."
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  if (showMobileCards) {
    return (
      <MobileCardList
        items={items}
        keyExtractor={(item) => (mobileKeyExtractor ? mobileKeyExtractor(item) : (item.id ?? ""))}
        emptyMessage={emptyMessage}
        renderCard={(item) => (mobileCardRender ? mobileCardRender(item) : null)}
        className="pb-0"
      />
    );
  }
  if (table) {
    const onRowHover = onRowPrefetch && queryClient
      ? (item: T) => {
          void queryClient.prefetchQuery(onRowPrefetch(item) as Parameters<QueryClient["prefetchQuery"]>[0]);
        }
      : undefined;
    return <DataTableV2 table={table} emptyMessage={emptyMessage} onRowClick={onRowClick} rowAction={rowAction} onRowHover={onRowHover} />;
  }
  return null;
}
