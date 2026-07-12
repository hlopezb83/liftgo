import { ReactNode, useEffect, useRef, useState } from "react";
import { type LucideIcon, SpinnerIcon, RefreshIcon, FilterIcon } from "@/components/icons";
import type { Table as TanstackTable } from "@tanstack/react-table";
import type { FetchQueryOptions } from "@tanstack/react-query";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { EmptyState } from "@/components/feedback/EmptyState";
import { MobileCardList } from "@/components/layout/MobileCardList";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DataTableV2 } from "@/components/dataTable/v2/DataTableV2";
import { DataTablePaginationV2 } from "@/components/dataTable/v2/DataTablePaginationV2";

interface ListPageLayoutProps<T> {
  title: string;
  subtitle?: string;
  totalCount?: number;
  actions?: ReactNode;
  /** Acción primaria opcional para mostrar como FAB flotante en móvil. */
  mobileFab?: ReactNode;
  filters?: ReactNode;
  isLoading: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /**
   * Instancia de tabla TanStack (usar `useLiftgoTable`).
   * Se renderiza con `DataTableV2` y `DataTablePaginationV2`.
   */
  table?: TanstackTable<T>;
  /** Click handler para filas (modo tabla). */
  onRowClick?: (item: T) => void;
  /** Handler opcional para prefetch de detalle al hacer hover en fila. */
  onRowPrefetch?: (item: T) => FetchQueryOptions;
  /** Si se provee, en mobile/tablet se renderiza como tarjetas en lugar de tabla. */
  mobileCardRender?: (item: T) => ReactNode;
  /** Extractor de key para mobile cards. Default: (item).id */
  mobileKeyExtractor?: (item: T) => string;
  customContent?: ReactNode;
  skeletonColumns?: number;
  /** Callback para pull-to-refresh en móvil. Debe devolver una promesa. */
  onRefresh?: () => Promise<unknown> | void;
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
  emptyMessage = "No se encontraron resultados",
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  table,
  onRowClick,
  onRowPrefetch,
  mobileCardRender,
  mobileKeyExtractor,
  customContent,
  skeletonColumns,
  onRefresh,
}: ListPageLayoutProps<T>) {
  const isMobile = useIsMobile();
  const isTabletOrBelow = useIsTabletOrBelow();
  const showMobileCards = isTabletOrBelow && !!mobileCardRender;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrollTarget, setScrollTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!isMobile || !onRefresh) {
      setScrollTarget(null);
      return;
    }
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
      <div ref={sentinelRef} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
                showEmpty={showEmpty}
                showMobileCards={showMobileCards}
                items={effectiveItems}
                table={table}
                emptyMessage={emptyMessage}
                emptyIcon={emptyIcon}
                emptyActionLabel={emptyActionLabel}
                onEmptyAction={onEmptyAction}
                onRowClick={onRowClick}
                onRowPrefetch={onRowPrefetch}
                mobileCardRender={mobileCardRender}
                mobileKeyExtractor={mobileKeyExtractor}
                skeletonColumns={skeletonColumns}
              />
              {hasPagination && <DataTablePaginationV2 table={table} />}
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
        <Button variant="outline" size="sm" className="touch:h-11 w-full justify-center gap-2">
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
  showEmpty: boolean;
  showMobileCards: boolean;
  items: T[];
  table?: TanstackTable<T>;
  emptyMessage: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRowClick?: (item: T) => void;
  mobileCardRender?: (item: T) => ReactNode;
  mobileKeyExtractor?: (item: T) => string;
  skeletonColumns?: number;
}

function TableContent<T extends { id?: string }>({
  isLoading, showEmpty, showMobileCards, items, table,
  emptyMessage, emptyIcon, emptyActionLabel, onEmptyAction,
  onRowClick, mobileCardRender, mobileKeyExtractor, skeletonColumns,
}: TableContentProps<T>) {
  if (isLoading) return <TableSkeleton columnCount={skeletonColumns} />;
  if (showEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyMessage}
        subtitle="Aún no se han registrado registros aquí."
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
    return <DataTableV2 table={table} emptyMessage={emptyMessage} onRowClick={onRowClick} />;
  }
  return null;
}


