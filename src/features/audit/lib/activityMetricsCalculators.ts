import type { AppRole } from "@/features/users";
import type { MemberStat, ModuleStat, HourStat } from "../hooks/activityMetricsTypes";

interface Row {
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  entity_type: string;
  created_at: string;
}

function upsertMember(memberMap: Map<string, MemberStat>, r: Row) {
  const key = r.actor_id ?? "system";
  const existing = memberMap.get(key);
  if (existing) {
    existing.total += 1;
    if (r.created_at > existing.lastAt) existing.lastAt = r.created_at;
    return;
  }
  memberMap.set(key, {
    actorId: r.actor_id,
    actorName: r.actor_name ?? "Sistema",
    actorRole: r.actor_role as AppRole | null,
    total: 1,
    lastAt: r.created_at,
  });
}

export function aggregateActivity(rows: Row[]): {
  byMember: MemberStat[];
  byModule: ModuleStat[];
  byHour: HourStat[];
} {
  const memberMap = new Map<string, MemberStat>();
  const moduleMap = new Map<string, number>();
  const hourMap = new Map<number, number>();
  for (const r of rows) {
    upsertMember(memberMap, r);
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
  return { byMember, byModule, byHour };
}

export async function fetchActivityRanges(range: ActivityRange) {
  const spanMs = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - spanMs);
  const excludeE2E = "is_e2e.is.null,is_e2e.eq.false";
  const [current, previous] = await Promise.all([
    supabase
      .from("activity_feed")
      .select("actor_id,actor_name,actor_role,entity_type,created_at")
      .gte("created_at", range.from.toISOString())
      .lte("created_at", range.to.toISOString())
      .or(excludeE2E)
      .limit(10000),
    supabase
      .from("activity_feed")
      .select("id", { count: "exact", head: true })
      .gte("created_at", prevFrom.toISOString())
      .lt("created_at", range.from.toISOString())
      .or(excludeE2E),
  ]);
  if (current.error) throw current.error;
  if (previous.error) throw previous.error;
  return { rows: (current.data ?? []) as Row[], previousCount: previous.count ?? 0 };
}
