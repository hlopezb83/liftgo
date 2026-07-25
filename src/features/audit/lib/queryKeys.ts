/**
 * Query keys y contratos de queries del módulo Auditoría.
 *
 * `auditKeys` provee el namespace raíz para invalidaciones amplias
 * (usado por las mutaciones de `useAuditLogs`). `auditLogsQueries` y
 * `activityMetricsQueries` encapsulan cada fetcher porque tienen formas
 * de dato distintas.
 *
 * v7.233.0 (P1-4b): la lista NO trae `old_data`/`new_data` — proyecta sólo
 * los campos necesarios para el label (name/booking/contract/invoice/quote/
 * description). El detalle re-descarga la fila completa por id.
 */
import { supabase } from "@/integrations/supabase/client";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
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
  /** Solo presente cuando se descarga el detalle por id. */
  old_data?: Record<string, unknown> | null;
  /** Solo presente cuando se descarga el detalle por id. */
  new_data?: Record<string, unknown> | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
  // joined
  user_email?: string;
  /** Etiqueta pre-computada para la lista (P1-4b). */
  label?: string;
}

export interface AuditLogFilters {
  table_name?: string;
  record_id?: string;
  [key: string]: unknown;
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

// P1-4b: proyecciones ligeras para armar el label sin traer old_data/new_data.
// PostgREST devuelve `null` si el campo no existe en el jsonb, así que basta
// escoger el primero definido entre new_* y luego old_*.
type LabelProjectionRow = {
  new_name: string | null; new_booking: string | null; new_contract: string | null;
  new_invoice: string | null; new_quote: string | null; new_desc: string | null;
  old_name: string | null; old_booking: string | null; old_contract: string | null;
  old_invoice: string | null; old_quote: string | null; old_desc: string | null;
};

function buildLabel(row: LabelProjectionRow, recordId: string): string {
  const first = (
    row.new_name ?? row.new_booking ?? row.new_contract ?? row.new_invoice ?? row.new_quote
    ?? row.old_name ?? row.old_booking ?? row.old_contract ?? row.old_invoice ?? row.old_quote
    ?? row.new_desc ?? row.old_desc
  );
  if (!first) return recordId.slice(0, 8);
  return first.length > 30 ? first.slice(0, 30) : first;
}

const LIST_SELECT =
  "id, table_name, record_id, action, changed_fields, user_id, created_at, " +
  "new_name:new_data->>name, new_booking:new_data->>booking_number, " +
  "new_contract:new_data->>contract_number, new_invoice:new_data->>invoice_number, " +
  "new_quote:new_data->>quote_number, new_desc:new_data->>description, " +
  "old_name:old_data->>name, old_booking:old_data->>booking_number, " +
  "old_contract:old_data->>contract_number, old_invoice:old_data->>invoice_number, " +
  "old_quote:old_data->>quote_number, old_desc:old_data->>description";

const DETAIL_SELECT =
  "id, table_name, record_id, action, old_data, new_data, changed_fields, user_id, created_at";

export const auditLogsQueries = defineEntityQueries<"audit-logs", AuditLog[], never, AuditLogFilters>(
  "audit-logs",
  {
    list: (filter) => async () => {
      const filters = readAuditLogFilters(filter);

      let query = supabase
        .from("audit_logs")
        .select(LIST_SELECT)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters.table_name) query = query.eq("table_name", filters.table_name);
      if (filters.record_id) query = query.eq("record_id", filters.record_id);

      const { data, error } = await query.returns<Array<LabelProjectionRow & {
        id: string;
        table_name: string;
        record_id: string;
        action: string;
        changed_fields: string[] | null;
        user_id: string | null;
        created_at: string;
      }>>();
      if (error) throw error;

      const logs: AuditLog[] = (data ?? []).map((row) => ({
        id: row.id,
        table_name: row.table_name,
        record_id: row.record_id,
        action: row.action,
        changed_fields: row.changed_fields,
        user_id: row.user_id,
        created_at: row.created_at,
        label: buildLabel(row, row.record_id),
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

/**
 * P1-4b: fetcher del detalle por id — trae old_data/new_data completos.
 * Sólo se llama al abrir un diálogo (detalle o revertir).
 */
export const auditLogDetailQueries = defineEntityQueries<"audit-log-detail", AuditLog | null, never, { id: string }>(
  "audit-log-detail",
  {
    list: (filter) => async () => {
      const id = typeof filter?.id === "string" ? filter.id : null;
      if (!id) return null;
      const { data, error } = await supabase
        .from("audit_logs")
        .select(DETAIL_SELECT)
        .eq("id", id)
        .maybeSingle<{
          id: string;
          table_name: string;
          record_id: string;
          action: string;
          old_data: unknown;
          new_data: unknown;
          changed_fields: string[] | null;
          user_id: string | null;
          created_at: string;
        }>();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        old_data: normalizeJson(data.old_data),
        new_data: normalizeJson(data.new_data),
      };
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
