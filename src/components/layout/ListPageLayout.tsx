import { ReactNode, useEffect, useRef, useState } from "react";
import { DataTablePaginationV2 } from "@/components/dataTable/v2/DataTablePaginationV2";
import { type LucideIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { FiltersSlot } from "@/components/layout/listPage/FiltersSlot";
import { LoadMoreFooter, type LoadMoreProps } from "@/components/layout/listPage/LoadMoreFooter";
import { PullToRefreshIndicator } from "@/components/layout/listPage/PullToRefreshIndicator";
import { TableContent } from "@/components/layout/listPage/TableContent";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrollTarget, setScrollTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Localizar el contenedor <main> real después del montaje para pull-to-refresh.
    // Es una lectura post-mount del DOM, no una sincronización de estado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isMobile || !onRefresh) { setScrollTarget(null); return; }
    setScrollTarget(sentinelRef.current?.closest("main") as HTMLElement | null);
  }, [isMobile, onRefresh]);

  const { pullDistance, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: onRefresh ?? (() => undefined),
    target: scrollTarget,
    enabled: isMobile && !!onRefresh,
  });

  const showFiltersInSheet = isMobile && !!filters;
  const ready = pullDistance >= threshold;

  const effectiveItems: T[] = table ? table.getRowModel().rows.map((r) => r.original) : [];
  const showEmpty = !isLoading && effectiveItems.length === 0;
  const hasPagination = effectiveItems.length > 0 && !!table;

  const subtitleText =
    totalCount !== undefined
      ? `${subtitle || ""}${subtitle ? " — " : ""}${totalCount} resultado${totalCount !== 1 ? "s" : ""}`
      : subtitle;

  return (
    <PageTransition>
      <div ref={sentinelRef} className={cn("p-4 sm:p-6 space-y-6", isMobile && mobileFab && "pb-[calc(env(safe-area-inset-bottom)+6rem)]")}>
        <PullToRefreshIndicator
          visible={!!(isMobile && onRefresh && (pullDistance > 0 || isRefreshing))}
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          ready={ready}
        />
        <PageHeader
          title={title}
          subtitle={subtitleText}
          action={isMobile && mobileFab ? undefined : actions}
        />
        <FiltersSlot
          filters={filters}
          inSheet={showFiltersInSheet}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
        />
        {customContent || (
          <Card>
            <CardContent className="p-0">
              <TableContent
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
              />
              {hasPagination && !isError && <DataTablePaginationV2 table={table} />}
              {loadMore && !isError && !isLoading && effectiveItems.length > 0 && (
                <LoadMoreFooter {...loadMore} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {isMobile && mobileFab && (
        <div className="fixed right-4 z-40 pointer-events-none" style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <div className="pointer-events-auto">{mobileFab}</div>
        </div>
      )}
    </PageTransition>
  );
}
