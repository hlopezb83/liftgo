import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";

import { EXCLUDE_E2E_FILTER, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { invoiceKeys } from "../../lib/queryKeys";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export function useInvoices() {
  return useQuery({
    queryKey: invoiceKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .or(EXCLUDE_E2E_FILTER)
        .order("created_at", { ascending: false })
        .limit(LIST_PAGE_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: id ? invoiceKeys.detail(id) : invoiceKeys.details(),
    enabled: !!id,
    // El detalle puede quedar huérfano (borrado en otra pestaña, RLS, id inválido
    // en URL). El componente ya maneja `!invoice` → "Factura no encontrada",
    // así que silenciamos el toast global para este caso benigno.
    meta: { silent: true },
    queryFn: async () => {
      if (!id) throw new Error("Invoice ID is required");
      const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}


export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoice: Omit<TablesInsert<"invoices">, "invoice_number">) => {
      const { data: numData, error: numError } = await supabase.rpc("next_invoice_number");
      if (numError) throw numError;
      const { data, error } = await supabase
        .from("invoices")
        .insert({ ...invoice, invoice_number: numData as string })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invoiceKeys.all }),
    onError: (err: Error) => {
      notifyError({ title: "Error al crear factura", error: err });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"invoices"> & { id: string }) => {
      const { data, error } = await supabase.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(data.id) });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al actualizar factura", error: err });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      // Removemos el detalle del cache ANTES de invalidar para que
      // `useInvoice(id)` no refetchee una fila borrada (PGRST116).
      queryClient.removeQueries({ queryKey: invoiceKeys.detail(id), exact: true });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
      notifySuccess("Factura eliminada");
    },

    onError: (err: Error) => {
      notifyError({ title: "Error al eliminar factura", error: err });
    },
  });
}
