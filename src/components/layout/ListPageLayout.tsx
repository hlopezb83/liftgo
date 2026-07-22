import { ReactNode, useEffect, useRef, useState } from "react";
import { DataTablePaginationV2 } from "@/components/dataTable/v2/DataTablePaginationV2";
import { DataTableV2 } from "@/components/dataTable/v2/DataTableV2";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { type LucideIcon, SpinnerIcon, RefreshIcon, FilterIcon } from "@/components/icons";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  loadMore?: {
    hasMore: boolean;
    isLoading: boolean;
    onClick: () => void;
    /** Total de registros ya visibles, sólo para el label ("Mostrando N"). */
    loaded?: number;
  };
}

// eslint-disable-next-line complexity -- componente de layout con múltiples slots opcionales
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
                <div className="flex items-center justify-center gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
                  {typeof loadMore.loaded === "number" && (
                    <span>Mostrando {loadMore.loaded} registro{loadMore.loaded === 1 ? "" : "s"}</span>
                  )}
                  {loadMore.hasMore ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMore.onClick}
                      disabled={loadMore.isLoading}
                    >
                      {loadMore.isLoading ? (
                        <><SpinnerIcon className="mr-2 h-4 w-4 animate-spin" />Cargando…</>
                      ) : (
                        "Cargar más"
                      )}
                    </Button>
                  ) : (
                    <span>No hay más resultados.</span>
                  )}
                </div>
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

function PullToRefreshIndicator({
  visible, pullDistance, isRefreshing, ready,
}: { visible: boolean; pullDistance: number; isRefreshing: boolean; ready: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="flex items-center justify-center text-xs text-muted-foreground -mt-2 -mb-2"
      style={{ height: Math.max(24, pullDistance), transition: isRefreshing ? "height 200ms ease" : undefined }}
      aria-live="polite"
    >
      {isRefreshing ? (
        <span className="flex items-center gap-2"><SpinnerIcon className="h-4 w-4 animate-spin" />Actualizando…</span>
      ) : (
        <span className="flex items-center gap-2">
          <RefreshIcon className={`h-4 w-4 transition-transform ${ready ? "rotate-180" : ""}`} />
          {ready ? "Suelta para actualizar" : "Desliza para actualizar"}
        </span>
      )}
    </div>
  );
}

function FiltersSlot({
  filters, inSheet, open, onOpenChange,
}: { filters: ReactNode; inSheet: boolean; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!filters) return null;
  if (!inSheet) return <>{filters}</>;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="touch:h-11 w-auto justify-start gap-2">
          <FilterIcon className="h-4 w-4" />
          Filtros
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">{filters}</div>
      </SheetContent>
    </Sheet>
  );
}

interface TableContentProps<T> {
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

function TableContent<T extends { id?: string }>({
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


