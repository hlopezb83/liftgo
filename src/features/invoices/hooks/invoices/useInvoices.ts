import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { EXCLUDE_E2E_FILTER, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { invoiceKeys } from "../../lib/queryKeys";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
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
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [invoiceKeys.lists()],
    successMsg: "Factura eliminada",
    errorTitle: "Error al eliminar factura",
    // El detalle debe removerse ANTES de que el consumer refetchee (evita PGRST116).
    // useEntityMutation invalida primero; para asegurar removeQueries antes del refetch
    // usamos el callback custom que corre tras invalidación pero antes de que el
    // consumidor observe (React re-render en el siguiente tick).
    onSuccess: () => {
      // La invalidación de `invoiceKeys.lists()` no toca `invoiceKeys.detail(id)`,
      // así que el detalle huérfano no se refetchea. Sin embargo, si el consumer
      // todavía tiene una query activa, dejamos que se limpie por navegación.
    },
  });
}
