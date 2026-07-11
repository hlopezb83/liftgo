import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

interface ListToolbarProps {
  /** Slot izquierdo: normalmente `<SearchBar />`. */
  search?: ReactNode;
  /** Slot de filtros. En móvil se muestra dentro de un Sheet colapsable. */
  filters?: ReactNode;
  /** Slot derecho: acciones primarias (`<Button>Nuevo</Button>` etc.). */
  actions?: ReactNode;
  /** Chips activos, se muestran debajo de la barra principal. */
  activeFilters?: ReactNode;
  /** Etiqueta del botón que abre los filtros en móvil. Default "Filtros". */
  mobileFiltersLabel?: string;
}

/**
 * Slot único para el patrón "buscador + filtros + acciones" que hoy se repite
 * en cada listado. En móvil colapsa los filtros dentro de un `Sheet`.
 * Reemplazable pieza a pieza: cualquier slot es opcional.
 */
export function ListToolbar({
  search,
  filters,
  actions,
  activeFilters,
  mobileFiltersLabel = "Filtros",
}: ListToolbarProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const showFiltersInSheet = isMobile && !!filters;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        {search && <div className="flex-1 min-w-0">{search}</div>}
        {showFiltersInSheet ? (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="touch:h-11 gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                {mobileFiltersLabel}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <SheetHeader className="text-left">
                <SheetTitle>{mobileFiltersLabel}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">{filters}</div>
            </SheetContent>
          </Sheet>
        ) : (
          filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {activeFilters && <div className="flex flex-wrap items-center gap-1.5">{activeFilters}</div>}
    </div>
  );
}
