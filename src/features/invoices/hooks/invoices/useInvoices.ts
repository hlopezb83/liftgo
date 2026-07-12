import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { EXCLUDE_E2E_FILTER, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { invoiceKeys } from "../../lib/queryKeys";

type InvoiceListRow = Awaited<ReturnType<typeof fetchInvoiceList>>[number];
type InvoiceDetailRow = Awaited<ReturnType<typeof fetchInvoiceDetail>>;

async function fetchInvoiceList() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .or(EXCLUDE_E2E_FILTER)
    .order("created_at", { ascending: false })
    .limit(LIST_PAGE_LIMIT);
  if (error) throw error;
  return data ?? [];
}

async function fetchInvoiceDetail(id: string) {
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export const invoiceQueries = defineEntityQueries<"invoices", InvoiceListRow[], InvoiceDetailRow>(
  "invoices",
  {
    list: () => fetchInvoiceList,
    detail: (id) => () => fetchInvoiceDetail(id),
  },
);

export function useInvoices() {
  return useQuery(invoiceQueries.list());
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
