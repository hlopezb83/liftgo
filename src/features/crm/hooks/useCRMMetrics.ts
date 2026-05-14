import { useMemo } from "react";
import { useProspects, type Prospect } from "@/hooks/useProspects";

export interface CRMMetrics {
  activeCount: number;
  activeTotal: number;
  wonCountMTD: number;
  wonTotalMTD: number;
  lostCountMTD: number;
  winRate30d: number;
  active: Prospect[];
  closed: Prospect[];
  won: Prospect[];
  lost: Prospect[];
}

export function useCRMMetrics(): { data: CRMMetrics; isLoading: boolean } {
  const { data: prospects = [], isLoading } = useProspects();

  const data = useMemo<CRMMetrics>(() => {
    const active = prospects.filter((p) => !["cerrado_ganado", "cerrado_perdido"].includes(p.stage));
    const closed = prospects.filter((p) => ["cerrado_ganado", "cerrado_perdido"].includes(p.stage));
    const won = closed.filter((p) => p.stage === "cerrado_ganado");
    const lost = closed.filter((p) => p.stage === "cerrado_perdido");

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const wonMTD = won.filter((p) => p.closed_at && new Date(p.closed_at) >= startMonth);
    const lostMTD = lost.filter((p) => p.closed_at && new Date(p.closed_at) >= startMonth);

    const won30 = won.filter((p) => p.closed_at && new Date(p.closed_at) >= start30d).length;
    const lost30 = lost.filter((p) => p.closed_at && new Date(p.closed_at) >= start30d).length;
    const total30 = won30 + lost30;
    const winRate30d = total30 > 0 ? Math.round((won30 / total30) * 100) : 0;

    return {
      activeCount: active.length,
      activeTotal: active.reduce((s, p) => s + (p.deal_value ?? 0), 0),
      wonCountMTD: wonMTD.length,
      wonTotalMTD: wonMTD.reduce((s, p) => s + (p.final_amount ?? p.deal_value ?? 0), 0),
      lostCountMTD: lostMTD.length,
      winRate30d,
      active,
      closed,
      won,
      lost,
    };
  }, [prospects]);

  return { data, isLoading };
}
