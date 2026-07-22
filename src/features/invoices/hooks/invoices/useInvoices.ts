import { queryOptions, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { EXCLUDE_E2E_FILTER, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import {
  createInvoiceListFilters,
  createInvoiceListQueryKey,
  sanitizeInvoiceSearchForQuery,
  type InvoiceListFilters,
} from "../../lib/invoiceListFilters";
import { invoiceKeys } from "../../lib/queryKeys";

const INVOICE_STALE_MS = 60_000;
/** Tamaño de página para paginación por cursor en el listado de facturas. */
export const INVOICE_PAGE_SIZE = 100;

function baseInvoiceQuery(normalized: InvoiceListFilters) {
  let q = supabase.from("invoices").select("*").or(EXCLUDE_E2E_FILTER);
  if (normalized.status === "overdue") {
    q = q.in("status", ["sent", "partial"]).lt("due_date", todayKeyMty());
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
    .limit(LIST_PAGE_LIMIT);
  if (error) throw error;
  return data ?? [];
}

async function fetchInvoicePage(filters: InvoiceListFilters, pageIndex: number) {
  const from = pageIndex * INVOICE_PAGE_SIZE;
  const to = from + INVOICE_PAGE_SIZE - 1;
  const { data, error } = await baseInvoiceQuery(filters)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const rows = data ?? [];
  return { rows, nextPage: rows.length === INVOICE_PAGE_SIZE ? pageIndex + 1 : undefined };
}


async function fetchInvoiceDetail(id: string) {
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
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


export function useCreateInvoice() {
  return useEntityMutation({
    mutationFn: async (invoice: Omit<TablesInsert<"invoices">, "invoice_number">) => {
      const { data: numData, error: numError } = await supabase.rpc("next_draft_invoice_number");
      if (numError) throw numError;
      const { data, error } = await supabase
        .from("invoices")
        .insert({ ...invoice, invoice_number: numData as string })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [invoiceKeys.all],
    errorTitle: "Error al crear factura",
  });
}

/**
 * Paginación por cursor (range) para el listado de facturas.
 * Devuelve páginas de INVOICE_PAGE_SIZE con `fetchNextPage()` y `hasNextPage`.
 * Los filtros participan en la queryKey, de modo que cambiar filtros reinicia
 * la paginación automáticamente.
 */
export function useInvoicesInfinite(filters?: InvoiceListFilters) {
  const normalized = createInvoiceListFilters(filters);
  return useInfiniteQuery({
    queryKey: [...createInvoiceListQueryKey(normalized), "infinite"],
    queryFn: ({ pageParam }) => fetchInvoicePage(normalized, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    staleTime: INVOICE_STALE_MS,
  });
}

export function useUpdateInvoice() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"invoices"> & { id: string }) => {
      const { data, error } = await supabase.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    // `invoiceKeys.all` cubre listas y detalle (jerárquico), evitando invalidar dos veces.
    invalidateKeys: [invoiceKeys.all],
    errorTitle: "Error al actualizar factura",
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [invoiceKeys.lists()],
    successMsg: "Factura eliminada",
    errorTitle: "Error al eliminar factura",
    onSuccess: (id) => {
      // Removemos el detalle del cache para que `useInvoice(id)` no refetchee
      // una fila borrada (PGRST116).
      queryClient.removeQueries({ queryKey: invoiceKeys.detail(id), exact: true });
    },
  });
}
