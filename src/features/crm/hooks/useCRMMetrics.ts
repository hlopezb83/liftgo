
import { nowMty, toMty } from "@/lib/utils";
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

    // Ronda C (C3): `new Date()` usaba el reloj/TZ del navegador — un equipo mal
    // configurado cortaba el mes o los últimos 30 días en otra fecha que el resto
    // del sistema. `nowMty()` fija el "hoy" del negocio (America/Monterrey).
    const now = nowMty();

    // E5: los cortes se construyen sobre el reloj de Monterrey y las fechas de
    // cierre se convierten a la MISMA escala con `toMty`. Antes se comparaba
    // una medianoche en la TZ del navegador contra un instante UTC, corriendo
    // el corte de mes unas horas en equipos fuera de México.
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const closedAtMty = (p: Prospect) => (p.closedAt ? toMty(p.closedAt) : null);

    const wonMTD = won.filter((p) => { const d = closedAtMty(p); return d !== null && d >= startMonth; });
    const lostMTD = lost.filter((p) => { const d = closedAtMty(p); return d !== null && d >= startMonth; });

    const won30 = won.filter((p) => { const d = closedAtMty(p); return d !== null && d >= start30d; }).length;
    const lost30 = lost.filter((p) => { const d = closedAtMty(p); return d !== null && d >= start30d; }).length;
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
