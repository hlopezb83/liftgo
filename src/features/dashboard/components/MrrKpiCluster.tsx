import { KpiTile } from "@/components/domain/KpiTile";
import { RevenueIcon, FleetIcon, ChartIcon, UserIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { averageRentPerUnit } from "../lib/mrrKpis";
import type { MrrItem } from "../hooks/useMrrColumns";

interface Props {
  items: MrrItem[];
  totalMrr: number;
  isLoading: boolean;
}

/**
 * v7.226.1 · extraído de MrrDetailPage para bajar la complejidad ciclomática.
 * MRR, ARR, rentas activas y renta promedio por unidad.
 * ARR = MRR × 12; renta prom. / unidad = MRR ÷ unidades rentadas (v7.264.2).
 */
export function MrrKpiCluster({ items, totalMrr, isLoading }: Props) {
  const avgPerUnit = averageRentPerUnit(totalMrr, items.length);
  const arr = totalMrr * 12;
  const fmt = (n: number) => (isLoading ? "…" : formatCurrency(n));


  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiTile
        label="MRR"
        value={fmt(totalMrr)}
        icon={RevenueIcon}
        iconColor="text-success"
        iconBg="bg-success/10"
        valueSize="lg"
      />
      <KpiTile
        label="ARR"
        value={fmt(arr)}
        icon={ChartIcon}
        iconColor="text-primary"
        iconBg="bg-primary/10"
      />
      <KpiTile
        label="Rentas activas"
        value={isLoading ? "…" : items.length}
        icon={FleetIcon}
        iconColor="text-info"
        iconBg="bg-info/10"
      />
      <KpiTile
        label="Renta prom. / unidad"
        value={fmt(avgPerUnit)}
        icon={UserIcon}
        iconColor="text-warning"
        iconBg="bg-warning/10"
        hint={
          <span className="text-3xs text-muted-foreground">
            MRR ÷ {isLoading ? "…" : items.length} unidades rentadas
          </span>
        }
      />

    </div>
  );
}
