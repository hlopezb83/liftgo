import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { callRpc } from "@/lib/rpc";
import type { Database } from "@/integrations/supabase/types";
import { SUPPLIER_BILLS_QK } from "./useSupplierBills";

type Insert = Database["public"]["Tables"]["supplier_bills"]["Insert"];
type Update = Database["public"]["Tables"]["supplier_bills"]["Update"];

export type SupplierBillInput = Omit<Insert, "bill_number" | "balance" | "status"> & {
  status?: Insert["status"];
};

async function nextBillNumber(): Promise<string> {
  return callRpc<string>("next_supplier_bill_number");
}

export function useCreateSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SupplierBillInput) => {
      const bill_number = await nextBillNumber();
      const { data, error } = await supabase
        .from("supplier_bills")
        .insert({ ...input, bill_number })
        .select("id, bill_number")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      notifySuccess("Factura registrada", { description: row.bill_number });
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo registrar la factura" }),
  });
}

export type SupplierBillUpdateInput = Omit<Update, "id" | "bill_number" | "balance" | "status" | "created_at" | "updated_at">;

export function useUpdateSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SupplierBillUpdateInput & { total: number } }) => {
      // balance se mantiene == total mientras no haya pagos (guardado por UI).
      const { error } = await supabase
        .from("supplier_bills")
        .update({ ...patch, balance: patch.total })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      qc.invalidateQueries({ queryKey: supplierBillKeys.detail(id) });
      notifySuccess("Factura actualizada");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo actualizar la factura" }),
  });
}

export function useDeleteSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supplier_bills").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      qc.invalidateQueries({ queryKey: supplierBillKeys.detail(id) });
      notifySuccess("Factura eliminada");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo eliminar la factura" }),
  });
}

export function useCancelSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from("supplier_bills")
        .update({ status: "cancelled", notes: reason ?? null })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      qc.invalidateQueries({ queryKey: supplierBillKeys.detail(id) });
      notifySuccess("Factura cancelada");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo cancelar la factura" }),
  });
}
