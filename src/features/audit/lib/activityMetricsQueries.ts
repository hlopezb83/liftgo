/**
 * Métricas de actividad del módulo Auditoría (RPC `get_activity_metrics`).
 */
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import type {
  ActivityRange,
  ActivityMetrics,
  MemberStat,
  ModuleStat,
  HourStat,
} from "../hooks/activityMetricsTypes";

export interface ActivityMetricsRpcPayload {
  byMember: MemberStat[];
  byModule: ModuleStat[];
  byHour: HourStat[];
  previousCount: number;
}

// Un string malformado produce `Invalid Date` y `toISOString()` lanza dentro
// del queryFn. Se normaliza como `readActivityFeedFilter` (dashboard): sólo
// se acepta un Date válido o un string parseable a fecha válida; si no, cae
// a "ahora".
export function parseRangeDate(raw: unknown): Date {
  const d = raw instanceof Date ? raw : typeof raw === "string" ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
}

export function readActivityRange(filter: Readonly<Record<string, unknown>> | undefined): ActivityRange {
  return {
    from: parseRangeDate(filter?.from),
    to: parseRangeDate(filter?.to),
  };
}

export const activityMetricsQueries = defineEntityQueries<"audit-activity-metrics", ActivityMetrics>(
  "audit-activity-metrics",
  {
    list: (filter) => async () => {
      const range = readActivityRange(filter);

      // RPC server-side: agrega en DB en vez de descargar hasta 10k filas.
      const payload = await callRpc<ActivityMetricsRpcPayload | null>("get_activity_metrics", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      });
      const byMember = payload?.byMember ?? [];
      const byModule = payload?.byModule ?? [];
      const byHour = payload?.byHour ?? [];

      const totalCurrent = byMember.reduce((sum, m) => sum + m.total, 0);
      // R6-FE-11d (N6-ADM-02): el trigger no propaga actor_id (NULL = "Sistema");
      // filtrar null mostraba "Usuarios activos 0" con acciones registradas.
      // Se cuenta el bucket Sistema como un actor más hasta que la DB propague
      // el actor real (R6-DB pendiente).
      const uniqueActors = byMember.filter((m) => m.actorId !== null || m.total > 0).length;
      const peakHour = byHour.length > 0
        ? byHour.reduce((max, h) => (h.total > max.total ? h : max)).hour
        : null;

      return {
        totalCurrent,
        totalPrevious: payload?.previousCount ?? 0,
        uniqueActors,
        topModule: byModule[0]?.entityType ?? null,
        peakHour,
        byMember,
        byModule,
        byHour,
      };
    },
    staleTime: 60_000,
  },
);
