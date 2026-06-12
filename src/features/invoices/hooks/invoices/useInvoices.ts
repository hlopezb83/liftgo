import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invoiceKeys } from "@/features/invoices/lib/queryKeys";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export function useInvoices() {
  return useQuery({
    queryKey: invoiceKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").or("is_e2e.is.null,is_e2e.eq.false").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: id ? invoiceKeys.detail(id) : invoiceKeys.details(),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Invoice ID is required");
      const { data, error } = await supabase.from("invoices").select("*").eq("id", id).single();
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.success("Factura eliminada");
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al eliminar factura", error: err });
    },
  });
}
