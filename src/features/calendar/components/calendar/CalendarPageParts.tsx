import { RefreshIcon, WarnIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMtyDate } from "@/lib/utils";

/**
 * Piezas visuales de CalendarPage: alerta de reservas por vencer, toolbar de
 * vistas/rango y skeleton de carga. La orquestación de datos y navegación
 * permanece en `pages/CalendarPage.tsx`.
 */

export type ForkliftLike = { id: string; name: string };
export type BookingLike = { id: string; forklift_id: string; customer_name: string | null; end_date: string };

export function EndingSoonAlert({ items, forkliftMap }: { items: BookingLike[]; forkliftMap: Map<string, ForkliftLike> }) {
  if (items.length === 0) return null;
  return (
    <Card className="border-status-maintenance/30 bg-status-maintenance/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <WarnIcon className="h-4 w-4 text-status-maintenance" />
          <span className="font-medium text-sm">Reservas por vencer ({items.length})</span>
        </div>
        <div className="space-y-1">
          {items.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm p-2 rounded bg-background/80">
              <span>{forkliftMap.get(b.forklift_id)?.name} — {b.customer_name ?? "Sin cliente"}</span>
              <span className="text-xs text-muted-foreground">Termina: {formatMtyDate(b.end_date)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export interface CalendarToolbarProps {
  viewMode: "gantt" | "list";
  setViewMode: (v: "gantt" | "list") => void;
  ganttRange: "month" | "week";
  setGanttRange: (v: "month" | "week") => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function CalendarToolbar({ viewMode, setViewMode, ganttRange, setGanttRange, isRefreshing, onRefresh }: CalendarToolbarProps) {
  return (
    <div className="flex items-center flex-wrap gap-2">
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "gantt" | "list")}>
        <TabsList className="h-8 touch:h-11">
          {/* R6-FE-09: h-6 = 24px; en táctil sube a 44px. */}
          <TabsTrigger value="gantt" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Gantt</TabsTrigger>
          <TabsTrigger value="list" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Lista</TabsTrigger>
        </TabsList>
      </Tabs>
      {viewMode === "gantt" && (
        <Tabs value={ganttRange} onValueChange={(v) => setGanttRange(v as "month" | "week")}>
          <TabsList className="h-8 touch:h-11">
            <TabsTrigger value="week" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Semana</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-3 h-6 touch:h-11 touch:min-w-11">Mes</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-8 ml-auto touch:h-11"
        disabled={isRefreshing}
        onClick={onRefresh}
        aria-label="Actualizar calendario"
      >
        <RefreshIcon className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} /> Actualizar
      </Button>
    </div>
  );
}

/**
 * Skeleton que anticipa el layout real: KPIs de flota (4 tiles), la toolbar de
 * vistas/rango y la tarjeta del Gantt/lista, para evitar el salto de contenido
 * al hidratar. Misma convención que TableSkeleton: role="status" + sr-only.
 */
export function CalendarLoadingSkeleton() {
  return (
    <PageContainer>
      <PageHeader title="Calendario de Disponibilidad" />
      <div className="space-y-6" role="status">
        <span className="sr-only">Cargando calendario…</span>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-24 ml-auto" />
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </PageContainer>
  );
}
