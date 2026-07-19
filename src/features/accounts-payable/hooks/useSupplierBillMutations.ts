import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { supplierBillKeys } from "./useSupplierBills";

type Insert = Database["public"]["Tables"]["supplier_bills"]["Insert"];
type Update = Database["public"]["Tables"]["supplier_bills"]["Update"];

export type SupplierBillInput = Omit<Insert, "bill_number" | "balance" | "status"> & {
  status?: Insert["status"];
};

async function nextBillNumber(): Promise<string> {
  return callRpc<string>("next_supplier_bill_number");
}

export function useCreateSupplierBill() {
  return useEntityMutation<SupplierBillInput, { id: string; bill_number: string }>({
    mutationFn: async (input) => {
      const bill_number = await nextBillNumber();
      const { data, error } = await supabase
        .from("supplier_bills")
        .insert({ ...input, bill_number })
        .select("id, bill_number")
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [supplierBillKeys.all],
    errorTitle: "No se pudo registrar la factura",
    onSuccess: (row) => {
      notifySuccess("Factura registrada", { description: row.bill_number });
    },
  });
}

export type SupplierBillUpdateInput = Omit<Update, "id" | "bill_number" | "balance" | "status" | "created_at" | "updated_at">;

export function useUpdateSupplierBill() {
  return useEntityMutation<{ id: string; patch: SupplierBillUpdateInput & { total: number } }, string>({
    mutationFn: async ({ id, patch }) => {
      // BL-21: el balance lo recalcula el trigger trg_supplier_bill_recalc_on_total
      // en el servidor a partir de los pagos existentes. No enviar balance desde el cliente.
      const { error } = await supabase
        .from("supplier_bills")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierBillKeys.all],
    successMsg: "Factura actualizada",
    errorTitle: "No se pudo actualizar la factura",
  });
}

async function assertNoCompletedPayments(billId: string): Promise<void> {
  const { count, error } = await supabase
    .from("supplier_payments")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", billId);
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new Error("La factura tiene pagos registrados. Reversa los pagos antes de eliminar o cancelar.");
  }
}

export function useDeleteSupplierBill() {
  return useEntityMutation<string, string>({
    mutationFn: async (id) => {
      await assertNoCompletedPayments(id);
      const { error } = await supabase.from("supplier_bills").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierBillKeys.all],
    successMsg: "Factura eliminada",
    errorTitle: "No se pudo eliminar la factura",
  });
}

export function useCancelSupplierBill() {
  return useEntityMutation<{ id: string; reason?: string }, string>({
    mutationFn: async ({ id, reason }) => {
      await assertNoCompletedPayments(id);
      const { error } = await supabase
        .from("supplier_bills")
        .update({ status: "cancelled", notes: reason ?? null })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    invalidateKeys: [supplierBillKeys.all],
    successMsg: "Factura cancelada",
    errorTitle: "No se pudo cancelar la factura",
  });
}

