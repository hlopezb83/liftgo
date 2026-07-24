import { KpiTile } from "@/components/domain/KpiTile";
import { RevenueIcon, FleetIcon, ChartIcon, UserIcon } from "@/components/icons";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { MrrItem } from "../hooks/useMrrColumns";

interface Props {
  items: MrrItem[];
  totalMrr: number;
  isLoading: boolean;
}

/**
 * v7.226.1 · extraído de MrrDetailPage para bajar la complejidad ciclomática.
 * MRR, ARR, rentas activas y ARPU. ARR = MRR × 12; ARPU = MRR / clientes únicos.
 */
export function MrrKpiCluster({ items, totalMrr, isLoading }: Props) {
  const uniqueCustomers = new Set(
    items.map((i) => i.customer_id ?? i.customer_name ?? i.forklift_id),
  ).size;
  const arpu = uniqueCustomers > 0 ? totalMrr / uniqueCustomers : 0;
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
        label="ARPU"
        value={fmt(arpu)}
        icon={UserIcon}
        iconColor="text-warning"
        iconBg="bg-warning/10"
      />
    </div>
  );
}
