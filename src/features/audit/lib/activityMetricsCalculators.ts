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
