import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/features/users/hooks/useUserRole";

export interface ActivityRange {
  from: Date;
  to: Date;
}

export interface MemberStat {
  actorId: string | null;
  actorName: string;
  actorRole: AppRole | null;
  total: number;
  lastAt: string;
}

export interface ModuleStat {
  entityType: string;
  total: number;
}

export interface HourStat {
  hour: number;
  total: number;
}

export interface ActivityMetrics {
  totalCurrent: number;
  totalPrevious: number;
  uniqueActors: number;
  topModule: string | null;
  peakHour: number | null;
  byMember: MemberStat[];
  byModule: ModuleStat[];
  byHour: HourStat[];
}

export function useActivityMetrics(range: ActivityRange) {
  return useQuery({
    queryKey: ["activity_metrics", range.from.toISOString(), range.to.toISOString()],
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityMetrics> => {
      const spanMs = range.to.getTime() - range.from.getTime();
      const prevFrom = new Date(range.from.getTime() - spanMs);

      const [current, previous] = await Promise.all([
        supabase
          .from("activity_feed")
          .select("actor_id,actor_name,actor_role,entity_type,created_at")
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString())
          .limit(10000),
        supabase
          .from("activity_feed")
          .select("id", { count: "exact", head: true })
          .gte("created_at", prevFrom.toISOString())
          .lt("created_at", range.from.toISOString()),
      ]);

      if (current.error) throw current.error;
      if (previous.error) throw previous.error;

      const rows = current.data ?? [];

      const memberMap = new Map<string, MemberStat>();
      const moduleMap = new Map<string, number>();
      const hourMap = new Map<number, number>();

      for (const r of rows) {
        const key = r.actor_id ?? "system";
        const existing = memberMap.get(key);
        if (existing) {
          existing.total += 1;
          if (r.created_at > existing.lastAt) existing.lastAt = r.created_at;
        } else {
          memberMap.set(key, {
            actorId: r.actor_id,
            actorName: r.actor_name ?? "Sistema",
            actorRole: r.actor_role as AppRole | null,
            total: 1,
            lastAt: r.created_at,
          });
        }
        moduleMap.set(r.entity_type, (moduleMap.get(r.entity_type) ?? 0) + 1);
        const hour = new Date(r.created_at).getHours();
        hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
      }

      const byMember = [...memberMap.values()].sort((a, b) => b.total - a.total);
      const byModule = [...moduleMap.entries()]
        .map(([entityType, total]) => ({ entityType, total }))
        .sort((a, b) => b.total - a.total);
      const byHour = [...hourMap.entries()]
        .map(([hour, total]) => ({ hour, total }))
        .sort((a, b) => a.hour - b.hour);

      const uniqueActors = byMember.filter((m) => m.actorId !== null).length;
      const peakHour = byHour.length > 0
        ? byHour.reduce((max, h) => (h.total > max.total ? h : max)).hour
        : null;

      return {
        totalCurrent: rows.length,
        totalPrevious: previous.count ?? 0,
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
