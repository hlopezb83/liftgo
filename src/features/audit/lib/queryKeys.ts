/**
 * Query keys y contratos de queries del módulo Auditoría.
 *
 * `auditKeys` provee el namespace raíz para invalidaciones amplias
 * (usado por las mutaciones de `useAuditLogs`). `auditLogsQueries` y
 * `activityMetricsQueries` encapsulan cada fetcher porque tienen formas
 * de dato distintas.
 */
import { supabase } from "@/integrations/supabase/client";
import { callRpc } from "@/lib/rpc";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import type {
  ActivityRange,
  ActivityMetrics,
  MemberStat,
  ModuleStat,
  HourStat,
} from "../hooks/activityMetricsTypes";

export const auditKeys = createEntityKeys("audit");

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
  // joined
  user_email?: string;
}

export interface AuditLogFilters {
  table_name?: string;
  record_id?: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function readAuditLogFilters(filter: Readonly<Record<string, unknown>> | undefined): AuditLogFilters {
  const filters: AuditLogFilters = {};
  if (isRecord(filter)) {
    if (typeof filter.table_name === "string") filters.table_name = filter.table_name;
    if (typeof filter.record_id === "string") filters.record_id = filter.record_id;
  }
  return filters;
}

function normalizeJson(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export const auditLogsQueries = defineEntityQueries<"audit-logs", AuditLog[], never, AuditLogFilters>(
  "audit-logs",
  {
    list: (filter) => async () => {
      const filters = readAuditLogFilters(filter);

      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters.table_name) query = query.eq("table_name", filters.table_name);
      if (filters.record_id) query = query.eq("record_id", filters.record_id);

      // Nota: el trigger de auditoría ya descarta filas con is_e2e=true desde 2026-06-10.
      // Un filtro client-side sobre old_data->>is_e2e en PostgREST descarta también los NULL,
      // lo cual vaciaba la bitácora. Se confía en el trigger.

      const { data, error } = await query;
      if (error) throw error;

      const logs: AuditLog[] = (data ?? []).map((row) => ({
        ...row,
        old_data: normalizeJson(row.old_data),
        new_data: normalizeJson(row.new_data),
      }));
      const userIds = [...new Set(logs.map((l) => l.user_id).filter((id): id is string => id !== null))];

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
        logs.forEach((l) => {
          if (l.user_id) l.user_email = profileMap.get(l.user_id) ?? "Desconocido";
        });
      }

      return logs;
    },
    staleTime: 60_000,
  },
);

// ---------------------------------------------------------------------------
// Activity metrics
// ---------------------------------------------------------------------------

interface ActivityMetricsRpcPayload {
  byMember: MemberStat[];
  byModule: ModuleStat[];
  byHour: HourStat[];
  previousCount: number;
}

function readActivityRange(filter: Readonly<Record<string, unknown>> | undefined): ActivityRange {
  const fromRaw = filter?.from;
  const toRaw = filter?.to;
  return {
    from: typeof fromRaw === "string" ? new Date(fromRaw) : new Date(),
    to: typeof toRaw === "string" ? new Date(toRaw) : new Date(),
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
      const uniqueActors = byMember.filter((m) => m.actorId !== null).length;
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
