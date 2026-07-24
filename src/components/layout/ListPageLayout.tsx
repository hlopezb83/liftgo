import { ReactNode, useState } from "react";
import { type LucideIcon } from "@/components/icons";
import { FiltersSlot } from "@/components/layout/listPage/FiltersSlot";
import { ListPageBody } from "@/components/layout/listPage/ListPageBody";
import { type LoadMoreProps } from "@/components/layout/listPage/LoadMoreFooter";
import { PullToRefreshIndicator } from "@/components/layout/listPage/PullToRefreshIndicator";
import { useListPagePullToRefresh } from "@/components/layout/listPage/useListPagePullToRefresh";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Table as TanstackTable } from "@tanstack/react-table";

interface ListPageLayoutProps<T> {
  title: string;
  subtitle?: string;
  totalCount?: number;
  actions?: ReactNode;
  /** Acción primaria opcional para mostrar como FAB flotante en móvil. */
  mobileFab?: ReactNode;
  filters?: ReactNode;
  isLoading: boolean;
  /** UX-A1: si la query falla, renderizamos ErrorState en vez de EmptyState. */
  isError?: boolean;
  /** UX-A1: callback para el botón Reintentar del ErrorState. */
  onRetry?: () => void;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** UX-M6: si hay filtros activos y la lista está vacía, se muestra copy alterno + "Limpiar filtros". */
  hasActiveFilters?: boolean;
  /** UX-M6: callback para limpiar filtros desde el EmptyState. */
  onClearFilters?: () => void;

  /**
   * Instancia de tabla TanStack (usar `useLiftgoTable`).
   * Se renderiza con `DataTableV2` y `DataTablePaginationV2`.
   */
  table?: TanstackTable<T>;
  /** Click handler para filas (modo tabla). */
  onRowClick?: (item: T) => void;
  /** Handler opcional para prefetch de detalle al hacer hover en fila. */
  onRowPrefetch?: (item: T) => unknown;
  /** Si se provee, en mobile/tablet se renderiza como tarjetas en lugar de tabla. */
  mobileCardRender?: (item: T) => ReactNode;
  /** Extractor de key para mobile cards. Default: (item).id */
  mobileKeyExtractor?: (item: T) => string;
  customContent?: ReactNode;
  skeletonColumns?: number;
  /** Callback para pull-to-refresh en móvil. Debe devolver una promesa. */
  onRefresh?: () => Promise<unknown> | void;
  /** Slot opcional para paginación por cursor (botón "Cargar más"). */
  loadMore?: LoadMoreProps;
}

export function ListPageLayout<T extends { id?: string }>({
  title,
  subtitle,
  totalCount,
  actions,
  mobileFab,
  filters,
  isLoading,
  isError = false,
  onRetry,
  emptyMessage = "No se encontraron resultados",
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  hasActiveFilters = false,
  onClearFilters,
  table,
  onRowClick,
  onRowPrefetch,
  mobileCardRender,
  mobileKeyExtractor,
  customContent,
  skeletonColumns,
  onRefresh,
  loadMore,
}: ListPageLayoutProps<T>) {
  const isMobile = useIsMobile();
  const isTabletOrBelow = useIsTabletOrBelow();
  const showMobileCards = isTabletOrBelow && !!mobileCardRender;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { sentinelRef, pullDistance, isRefreshing, threshold, ready, indicatorVisible } =
    useListPagePullToRefresh(isMobile, onRefresh);

  const effectiveItems: T[] = table ? table.getRowModel().rows.map((r) => r.original) : [];
  const showEmpty = !isLoading && effectiveItems.length === 0;
  const hasMobileFab = !!(isMobile && mobileFab);

  return (
    <PageTransition>
      <div
        ref={sentinelRef}
        className={cn(
          "p-4 sm:p-6 space-y-6",
          hasMobileFab && "pb-[calc(env(safe-area-inset-bottom)+6rem)]",
        )}
      >
        <PullToRefreshIndicator
          visible={!!(isMobile && onRefresh && (pullDistance > 0 || isRefreshing))}
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          ready={pullDistance >= threshold}
        />
        <PageHeader
          title={title}
          subtitle={buildSubtitle(subtitle, totalCount)}
          action={hasMobileFab ? undefined : actions}
        />
        <FiltersSlot
          filters={filters}
          inSheet={isMobile && !!filters}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
        />
        <ListPageBody
          customContent={customContent}
          isLoading={isLoading}
          isError={isError}
          onRetry={onRetry}
          showEmpty={showEmpty}
          showMobileCards={showMobileCards}
          items={effectiveItems}
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
          loadMore={loadMore}
        />
      </div>
      {hasMobileFab && <MobileFabOverlay>{mobileFab}</MobileFabOverlay>}
    </PageTransition>
  );
}

function MobileFabOverlay({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed right-4 z-40 pointer-events-none"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}

function buildSubtitle(subtitle: string | undefined, totalCount: number | undefined): string | undefined {
  if (totalCount === undefined) return subtitle;
  const suffix = `${totalCount} resultado${totalCount !== 1 ? "s" : ""}`;
  return subtitle ? `${subtitle} — ${suffix}` : suffix;
}
