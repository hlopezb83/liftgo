import type { ReactNode } from "react";
import type { Table as TanstackTable } from "@tanstack/react-table";
import { DataTableV2 } from "@/components/dataTable/v2/DataTableV2";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { FilterIcon, type LucideIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";

export interface TableContentProps<T> {
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
}

export function TableContent<T extends { id?: string }>({
  isLoading, isError, onRetry, showEmpty, showMobileCards, items, table,
  emptyMessage, emptyIcon, emptyActionLabel, onEmptyAction,
  hasActiveFilters, onClearFilters,
  onRowClick, onRowPrefetch, mobileCardRender, mobileKeyExtractor, skeletonColumns,
}: TableContentProps<T>) {
  if (isError) return <ErrorState onRetry={onRetry} />;
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
      <div className="p-4">
        <MobileCardList
          items={items}
          keyExtractor={(item) => (mobileKeyExtractor ? mobileKeyExtractor(item) : (item.id ?? ""))}
          emptyMessage={emptyMessage}
          renderCard={(item) => (mobileCardRender ? mobileCardRender(item) : null)}
        />
      </div>
    );
  }
  if (table) {
    return <DataTableV2 table={table} emptyMessage={emptyMessage} onRowClick={onRowClick} onRowPrefetch={onRowPrefetch} />;
  }
  return null;
}
