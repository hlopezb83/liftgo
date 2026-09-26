import { ReactNode, useState } from "react";
import type { LiftgoTable } from "@/components/dataTable/v2/types";
import { type LucideIcon } from "@/components/icons";
import { FiltersSlot } from "@/components/layout/listPage/FiltersSlot";
import { ListPageBody } from "@/components/layout/listPage/ListPageBody";
import { type LoadMoreProps } from "@/components/layout/listPage/LoadMoreFooter";
import { PullToRefreshIndicator } from "@/components/layout/listPage/PullToRefreshIndicator";
import { useListPagePullToRefresh } from "@/components/layout/listPage/useListPagePullToRefresh";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";

interface ListPageLayoutProps<T extends { id?: string }> {
  title: string;
  subtitle?: string;
  totalCount?: number;
  actions?: ReactNode;
  /** Acciones secundarias junto a la acción primaria y los filtros en móvil. */
  mobileActions?: ReactNode;
  /** Sustituye actions en móvil; permanece en el flujo, antes de la lista. */
  mobilePrimaryAction?: ReactNode;
  filters?: ReactNode;
  /**
   * N-01: aviso persistente (p.ej. truncamiento de lista). Se renderiza entre
   * el encabezado y los filtros, FUERA del Sheet de filtros móvil, para que
   * sea visible en todos los viewports.
   */
  notice?: ReactNode;
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
  table?: LiftgoTable<T>;
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
  mobileActions,
  mobilePrimaryAction,
  filters,
  notice,
  isLoading,
  isError = false,
  onRetry,
  // V1-F5: copy unificado con DataTableV2/EmptyRow/búsqueda global ("Sin resultados").
  emptyMessage = "Sin resultados",
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
  const { sentinelRef, pullDistance, isRefreshing, ready, indicatorVisible } =
    useListPagePullToRefresh(isMobile, onRefresh);

  const effectiveItems: T[] = table ? table.getRowModel().rows.map((r) => r.original) : [];
  const showEmpty = !isLoading && effectiveItems.length === 0;
  const visibleActions = isMobile ? (mobilePrimaryAction ?? actions) : actions;

  return (
    <PageTransition>
      <div
        ref={sentinelRef}
        className="p-4 sm:p-6 space-y-6"
      >
        <PullToRefreshIndicator
          visible={indicatorVisible}
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          ready={ready}
        />
        <PageHeader
          title={title}
          subtitle={buildSubtitle(subtitle, totalCount)}
          action={isMobile ? undefined : visibleActions}
        />
        {notice}
        {isMobile ? (
          (visibleActions || mobileActions || filters) && (
            <div className="flex flex-wrap items-center gap-2">
              {visibleActions}
              {mobileActions}
              <FiltersSlot
                filters={filters}
                inSheet
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
              />
            </div>
          )
        ) : (
          <FiltersSlot
            filters={filters}
            inSheet={false}
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
          />
        )}
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
    </PageTransition>
  );
}

function buildSubtitle(subtitle: string | undefined, totalCount: number | undefined): string | undefined {
  if (totalCount === undefined) return subtitle;
  const suffix = `${totalCount} resultado${totalCount !== 1 ? "s" : ""}`;
  return subtitle ? `${subtitle} — ${suffix}` : suffix;
}
