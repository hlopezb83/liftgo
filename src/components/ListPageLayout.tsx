import { ReactNode, useEffect, useRef, useState } from "react";
import { type LucideIcon, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { Table as TanstackTable } from "@tanstack/react-table";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { TablePagination } from "@/components/TablePagination";
import { MobileCardList } from "@/components/MobileCardList";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableHeader } from "@/components/ui/table";
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
  /** Items a mostrar (modo legacy con renderRow). Opcional cuando se usa `table`. */
  items?: T[];
  /** Página actual (legacy). Ignorado si se provee `table`. */
  page?: number;
  /** Total de páginas (legacy). Ignorado si se provee `table`. */
  totalPages?: number;
  /** Cambio de página (legacy). Ignorado si se provee `table`. */
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Modo legacy: header manual con SortableTableHead. */
  tableHeader?: ReactNode;
  /** Modo legacy: render por fila con TableRow. */
  renderRow?: (item: T, index: number) => ReactNode;
  /**
   * Modo nuevo: instancia de tabla TanStack (usar `useLiftgoTable`).
   * Cuando se provee, se renderiza con `DataTableV2` y `DataTablePaginationV2`,
   * ignorando `items`, `tableHeader`, `renderRow` y los props de paginación.
   */
  table?: TanstackTable<T>;
  /** Si se provee, en mobile/tablet se renderiza como tarjetas en lugar de tabla. */
  mobileCardRender?: (item: T) => ReactNode;
  /** Extractor de key para mobile cards. Default: (item).id */
  mobileKeyExtractor?: (item: T) => string;
  customContent?: ReactNode;
  skeletonColumns?: number;
  /** Callback para pull-to-refresh en móvil. Debe devolver una promesa. */
  onRefresh?: () => Promise<unknown> | void;
}

export function ListPageLayout<T extends { id?: string }>({
  title,
  subtitle,
  totalCount,
  actions,
  mobileFab,
  filters,
  isLoading,
  items,
  page,
  totalPages,
  onPageChange,
  emptyMessage = "No se encontraron resultados",
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  tableHeader,
  renderRow,
  table,
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

  // Datos a usar para empty/mobile/legacy render: prioriza `table` cuando existe.
  const effectiveItems: T[] = table
    ? table.getRowModel().rows.map((r) => r.original)
    : items ?? [];

  const renderTableContent = () => {
    if (isLoading) return <TableSkeleton columnCount={skeletonColumns} />;
    if (effectiveItems.length === 0) {
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
            items={effectiveItems}
            keyExtractor={(item) => (mobileKeyExtractor ? mobileKeyExtractor(item) : (item.id ?? ""))}
            emptyMessage={emptyMessage}
            renderCard={mobileCardRender!}
          />
        </div>
      );
    }
    if (table) {
      return <DataTableV2 table={table} emptyMessage={emptyMessage} />;
    }
    if (tableHeader && renderRow) {
      return (
        <Table>
          <TableHeader>{tableHeader}</TableHeader>
          <TableBody>{effectiveItems.map((item, i) => renderRow(item, i))}</TableBody>
        </Table>
      );
    }
    return null;
  };

  const renderPagination = () => {
    if (effectiveItems.length === 0) return null;
    if (table) return <DataTablePaginationV2 table={table} />;
    if (page !== undefined && totalPages !== undefined && onPageChange) {
      return <TablePagination page={page} totalPages={totalPages} onPageChange={onPageChange} />;
    }
    return null;
  };

  return (
    <PageTransition>
      <div ref={sentinelRef} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {isMobile && onRefresh && (pullDistance > 0 || isRefreshing) && (
          <div
            className="flex items-center justify-center text-xs text-muted-foreground -mt-2 -mb-2"
            style={{ height: Math.max(24, pullDistance), transition: isRefreshing ? "height 200ms ease" : undefined }}
            aria-live="polite"
          >
            {isRefreshing ? (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Actualizando…</span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 transition-transform ${ready ? "rotate-180" : ""}`} />
                {ready ? "Suelta para actualizar" : "Desliza para actualizar"}
              </span>
            )}
          </div>
        )}
        <PageHeader
          title={title}
          subtitle={totalCount !== undefined ? `${subtitle || ""}${subtitle ? " — " : ""}${totalCount} resultado${totalCount !== 1 ? "s" : ""}` : subtitle}
          action={isMobile && mobileFab ? undefined : actions}
        />
        {filters && (
          showFiltersInSheet ? (
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="touch:h-11 w-full justify-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
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
          ) : (
            filters
          )
        )}
        {customContent || (
          <Card>
            <CardContent className="p-0">
              {renderTableContent()}
              {renderPagination()}
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
