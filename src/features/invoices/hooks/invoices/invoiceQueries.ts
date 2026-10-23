import { queryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { e2eVisibilityFilter, LIST_FETCH_LIMIT, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import {
  createInvoiceListFilters,
  createInvoiceListQueryKey,
  sanitizeInvoiceSearchForQuery,
  type InvoiceListFilters,
} from "../../lib/invoiceListFilters";
import { normalizeInvoiceListSorting, type InvoiceListSorting } from "../../lib/invoiceListSorting";
import { invoiceKeys } from "../../lib/queryKeys";

type InvoiceRow = Tables<"invoices">;

const INVOICE_STALE_MS = 60_000;
/** Tamaño de página para paginación por cursor en el listado de facturas. */
export const INVOICE_PAGE_SIZE = 100;

// v7.216.0 (C6): columnas explícitas para reducir payload y evitar re-parseo
// costoso de tipos por `supabase-js` cuando el builder se reasigna.
const sel = (s: string): string => s;
// R-Perf P0-2: el detalle carga columnas completas (incluye `cfdi_xml` ~8-12KB
// y `line_items` JSONB pesado); la lista NUNCA los renderiza y arrastraba 6-10x
// el payload de red + inflaba el costo de `dataVersion` en la tabla.
const INVOICE_COLUMNS = sel(
  "id, invoice_number, folio, serie, customer_id, customer_name, booking_id, quote_id, " +
  "status, cfdi_status, cfdi_uuid, cfdi_pdf_url, cfdi_xml_url, cfdi_xml, cfdi_error_message, cfdi_xml_pending, " +
  "cancellation_status, cancellation_motive, cancellation_reason, cancelled_at, substitution_uuid, " +
  "acuse_pdf_url, acuse_xml_url, facturapi_invoice_id, facturapi_env, stamping_attempts, " +
  "stamp_variance, stamp_variance_checked_at, invoice_type, forma_pago, metodo_pago, uso_cfdi, " +
  "moneda, tipo_cambio, global_months, global_periodicity, global_year, " +
  "receptor_rfc, receptor_razon_social, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, " +
  "line_items, subtotal, tax_rate, tax_amount, total, notes, version, " +
  "billing_period_start, billing_period_end, issued_at, due_date, paid_at, " +
  "e2e_scope, is_e2e, created_at, updated_at",
);
// Sin `cfdi_xml` ni `line_items`. Suficiente para render de listas + filtros.
// Consumidores que necesiten esos campos deben cargar el detalle por id.
const INVOICE_LIST_FIELDS = [
  "id", "invoice_number", "folio", "serie", "customer_id", "customer_name",
  "booking_id", "quote_id", "status", "cfdi_status", "cfdi_uuid", "cfdi_pdf_url",
  "cfdi_xml_url", "cfdi_error_message", "cancellation_status", "cancellation_motive", "cancellation_reason", "cancelled_at",
  "substitution_uuid", "acuse_pdf_url", "acuse_xml_url", "facturapi_invoice_id", "facturapi_env", "stamping_attempts",
  "stamp_variance", "stamp_variance_checked_at", "invoice_type", "forma_pago", "metodo_pago", "uso_cfdi",
  "moneda", "tipo_cambio", "global_months", "global_periodicity", "global_year", "receptor_rfc",
  "receptor_razon_social", "receptor_regimen_fiscal", "receptor_domicilio_fiscal_cp", "subtotal", "tax_rate", "tax_amount",
  "total", "notes", "version", "billing_period_start", "billing_period_end", "issued_at",
  "due_date", "paid_at", "e2e_scope", "is_e2e", "created_at", "updated_at",
] as const satisfies readonly (keyof InvoiceRow)[];
const INVOICE_LIST_COLUMNS = INVOICE_LIST_FIELDS.join(", ");

/** Exact list projection. Load detail before reading document-only fields. */
export type InvoiceListItem = Pick<InvoiceRow, (typeof INVOICE_LIST_FIELDS)[number]>;

function baseInvoiceQuery(normalized: InvoiceListFilters) {
  let q = supabase.from("invoices").select(INVOICE_LIST_COLUMNS).or(e2eVisibilityFilter());
  if (normalized.status === "overdue") {
    // BL-R8-04 (R8-FE-01): alinear el tab "Vencido" con el criterio canónico de la DB
    // (v_overdue_invoices / get_dashboard_stats, migración 20260729082148 y 20260731191845):
    // incluir status='overdue' y excluir cancelaciones aceptadas.
    // La fecha de corte usa `todayKeyMty()` (America/Monterrey), misma fuente de "hoy"
    // que el resto del FE; la DB usa CURRENT_DATE (UTC) — ventana residual 18:00-24:00 MTY,
    // aceptada en BL-R8-21 (la unificación total de TZ es decisión de producto separada).
    q = q.in("status", ["sent", "partial", "overdue"])
      .lt("due_date", todayKeyMty())
      .or("cancellation_status.is.null,cancellation_status.neq.accepted");
  } else if (normalized.status !== "all") {
    q = q.eq("status", normalized.status);
  }
  if (normalized.cfdi !== "all") q = q.eq("cfdi_status", normalized.cfdi);
  if (normalized.from) q = q.gte("issued_at", normalized.from);
  if (normalized.to) q = q.lte("issued_at", normalized.to);
  const search = sanitizeInvoiceSearchForQuery(normalized.search);
  if (search) {
    const pattern = `%${search}%`;
    q = q.or(`invoice_number.ilike.${pattern},customer_name.ilike.${pattern}`);
  }
  return q;
}

async function fetchInvoiceList(filters?: InvoiceListFilters) {
  const normalized = createInvoiceListFilters(filters);
  const { data, error } = await baseInvoiceQuery(normalized)
    .order("created_at", { ascending: false })
    .limit(LIST_FETCH_LIMIT)
    .returns<InvoiceListItem[]>();
  if (error) throw error;
  return data ?? [];
}

async function fetchInvoicePage(filters: InvoiceListFilters, pageIndex: number, sorting: InvoiceListSorting) {
  const from = pageIndex * INVOICE_PAGE_SIZE;
  const to = from + INVOICE_PAGE_SIZE - 1;
  let query = baseInvoiceQuery(filters);
  for (const sort of sorting) {
    query = query.order(sort.id, { ascending: !sort.desc, nullsFirst: false });
  }
  if (sorting.length === 0) query = query.order("created_at", { ascending: false });
  // A unique tie-breaker keeps equal values in the same order across pages.
  const { data, error } = await query
    .order("id", { ascending: false })
    .range(from, to)
    .returns<InvoiceListItem[]>();
  if (error) throw error;
  const rows = data ?? [];
  return { rows, nextPage: rows.length === INVOICE_PAGE_SIZE ? pageIndex + 1 : undefined };
}

export async function fetchInvoicesForExport(
  filters: InvoiceListFilters | undefined,
  scope: { organizationId: string; signal: AbortSignal },
) {
  if (!scope.organizationId) throw new Error("Empresa no verificada");
  const normalized = createInvoiceListFilters(filters);
  const rows: InvoiceListItem[] = [];
  // Continue to an empty page instead of treating a server row cap as EOF.
  // Advance by the actual count so a smaller server cap cannot skip invoices.
  for (;;) {
    scope.signal.throwIfAborted();
    const { data, error } = await baseInvoiceQuery(normalized)
      .eq("organization_id", scope.organizationId)
      .abortSignal(scope.signal)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rows.length, rows.length + LIST_PAGE_LIMIT - 1)
      .returns<InvoiceListItem[]>();
    scope.signal.throwIfAborted();
    if (error) throw error; // Never return a partially downloaded export.
    if (!data?.length) return rows;
    rows.push(...data);
  }
}


async function fetchInvoiceDetail(id: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .returns<InvoiceRow | null>();
  if (error) throw error;
  return data;
}

function invoiceListQueryOptions(filters?: InvoiceListFilters) {
  const normalized = createInvoiceListFilters(filters);
  return queryOptions({
    queryKey: createInvoiceListQueryKey(normalized),
    queryFn: () => fetchInvoiceList(normalized),
    staleTime: INVOICE_STALE_MS,
  });
}

function invoiceDetailQueryOptions(id: string) {
  return queryOptions({
    queryKey: invoiceKeys.detail(id),
    queryFn: () => fetchInvoiceDetail(id),
    staleTime: INVOICE_STALE_MS,
    enabled: !!id,
  });
}

export const invoiceQueries = {
  keys: invoiceKeys,
  list: invoiceListQueryOptions,
  detail: invoiceDetailQueryOptions,
};

export function useInvoices(filters?: InvoiceListFilters) {
  return useQuery(invoiceQueries.list(filters));
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    ...invoiceQueries.detail(id ?? ""),
    enabled: !!id,
    // Detalle huérfano (borrado / RLS / id inválido en URL) → toast global silenciado;
    // el componente ya renderiza "Factura no encontrada".
    meta: { silent: true },
  });
}

/**
 * Paginación por cursor (range) para el listado de facturas.
 * Devuelve páginas de INVOICE_PAGE_SIZE con `fetchNextPage()` y `hasNextPage`.
 * Los filtros y el orden participan en la queryKey, de modo que cambiarlos reinicia
 * la paginación automáticamente.
 */
export function useInvoicesInfinite(filters?: InvoiceListFilters, sorting: InvoiceListSorting = []) {
  const normalized = createInvoiceListFilters(filters);
  const normalizedSorting = normalizeInvoiceListSorting(sorting);
  return useInfiniteQuery({
    queryKey: [...createInvoiceListQueryKey(normalized), "infinite", normalizedSorting],
    queryFn: ({ pageParam }) => fetchInvoicePage(normalized, pageParam as number, normalizedSorting),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    staleTime: INVOICE_STALE_MS,
    // R-Perf P3-10.4: evita parpadeo/vacío en la tabla al cambiar filtros o búsqueda.
    placeholderData: (prev) => prev,
  });
}
