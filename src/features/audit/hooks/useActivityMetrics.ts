import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";
import type {
  ActivityRange,
  ActivityMetrics,
  MemberStat,
  ModuleStat,
  HourStat,
} from "./activityMetricsTypes";

export type { ActivityRange, ActivityMetrics, MemberStat, ModuleStat, HourStat } from "./activityMetricsTypes";

interface RpcPayload {
  byMember: MemberStat[];
  byModule: ModuleStat[];
  byHour: HourStat[];
  previousCount: number;
}

export function useActivityMetrics(range: ActivityRange) {
  return useQuery({
    queryKey: ["activity_metrics", range.from.toISOString(), range.to.toISOString()],
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityMetrics> => {
      // RPC server-side: agrega en DB en vez de descargar hasta 10k filas.
      const payload = await callRpc<RpcPayload | null>("get_activity_metrics", {
        p_from: range.from.toISOString(),
        p_to: range.to.toISOString(),
      }) ?? ({} as RpcPayload);
      const byMember = payload.byMember ?? [];
      const byModule = payload.byModule ?? [];
      const byHour = payload.byHour ?? [];


      const totalCurrent = byMember.reduce((sum, m) => sum + m.total, 0);
      const uniqueActors = byMember.filter((m) => m.actorId !== null).length;
      const peakHour = byHour.length > 0
        ? byHour.reduce((max, h) => (h.total > max.total ? h : max)).hour
        : null;

      return {
        totalCurrent,
        totalPrevious: payload.previousCount ?? 0,
        uniqueActors,
        topModule: byModule[0]?.entityType ?? null,
        peakHour,
        byMember,
        byModule,
        byHour,
      };
    },
  });
}
