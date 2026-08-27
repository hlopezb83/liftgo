
import { useProspects, type Prospect } from "./useProspects";

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

/**
 * FIX B3: antes sólo se exponían `data` e `isLoading`. Si la consulta fallaba
 * (red o permisos), las páginas mostraban listas VACÍAS — el usuario creía que
 * no había registros cuando en realidad no se pudieron cargar.
 */
export function useCRMMetrics(): {
  data: CRMMetrics;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const { data: prospects = [], isLoading, isError, refetch } = useProspects();

  const data: CRMMetrics = (() => {
    const active = prospects.filter((p) => !p.isClosed);
    const closed = prospects.filter((p) => p.isClosed);
    const won = closed.filter((p) => p.stage === "cerrado_ganado");
    const lost = closed.filter((p) => p.stage === "cerrado_perdido");

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const wonMTD = won.filter((p) => p.closedAt && new Date(p.closedAt) >= startMonth);
    const lostMTD = lost.filter((p) => p.closedAt && new Date(p.closedAt) >= startMonth);

    const won30 = won.filter((p) => p.closedAt && new Date(p.closedAt) >= start30d).length;
    const lost30 = lost.filter((p) => p.closedAt && new Date(p.closedAt) >= start30d).length;
    const total30 = won30 + lost30;
    const winRate30d = total30 > 0 ? Math.round((won30 / total30) * 100) : 0;

    return {
      activeCount: active.length,
      activeTotal: active.reduce((s, p) => s + (p.dealValue ?? 0), 0),
      wonCountMTD: wonMTD.length,
      wonTotalMTD: wonMTD.reduce((s, p) => s + (p.finalAmount ?? p.dealValue ?? 0), 0),
      lostCountMTD: lostMTD.length,
      winRate30d,
      active,
      closed,
      won,
      lost,
    };
  })();

  return { data, isLoading, isError, refetch: () => { void refetch(); } };
}
