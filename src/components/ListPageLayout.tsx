import { ReactNode, useEffect, useRef, useState } from "react";
import { type LucideIcon, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
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

interface ListPageLayoutProps<T> {
  title: string;
  subtitle?: string;
  totalCount?: number;
  actions?: ReactNode;
  /** Acción primaria opcional para mostrar como FAB flotante en móvil. */
  mobileFab?: ReactNode;
  filters?: ReactNode;
  isLoading: boolean;
  items: T[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  tableHeader: ReactNode;
  renderRow: (item: T, index: number) => ReactNode;
  /** Si se provee, en mobile/tablet se renderiza como tarjetas en lugar de tabla. */
  mobileCardRender?: (item: T) => ReactNode;
  /** Extractor de key para mobile cards. Default: (item).id */
  mobileKeyExtractor?: (item: T) => string;
  customContent?: ReactNode;
  skeletonColumns?: number;
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
  mobileCardRender,
  mobileKeyExtractor,
  customContent,
  skeletonColumns,
}: ListPageLayoutProps<T>) {
  const isMobile = useIsMobile();
  const isTabletOrBelow = useIsTabletOrBelow();
  const showMobileCards = isTabletOrBelow && !!mobileCardRender;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const showFiltersInSheet = isMobile && !!filters;

  return (
    <PageTransition>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
              {isLoading ? (
                <TableSkeleton columnCount={skeletonColumns} />
              ) : items.length === 0 ? (
                <EmptyState
                  icon={emptyIcon}
                  title={emptyMessage}
                  subtitle="Aún no se han registrado registros aquí."
                  actionLabel={emptyActionLabel}
                  onAction={onEmptyAction}
                />
              ) : showMobileCards ? (
                <div className="p-4">
                  <MobileCardList
                    items={items}
                    keyExtractor={(item) => (mobileKeyExtractor ? mobileKeyExtractor(item) : (item.id ?? ""))}
                    emptyMessage={emptyMessage}
                    renderCard={mobileCardRender}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>{tableHeader}</TableHeader>
                  <TableBody>
                    {items.map((item, i) => renderRow(item, i))}
                  </TableBody>
                </Table>
              )}
              {items.length > 0 && <TablePagination page={page} totalPages={totalPages} onPageChange={onPageChange} />}
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
