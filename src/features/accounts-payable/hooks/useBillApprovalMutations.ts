import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { callRpc } from "@/lib/rpc";
import { SUPPLIER_BILLS_QK, supplierBillKeys } from "./useSupplierBills";

function buildInvalidator(qc: ReturnType<typeof useQueryClient>, billId: string) {
  qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
  qc.invalidateQueries({ queryKey: supplierBillKeys.detail(billId) });
  qc.invalidateQueries({ queryKey: ["accounts_payable_kpis"] });
  qc.invalidateQueries({ queryKey: ["supplier_bill_approvals", billId] });
}

export function useApproveSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, notes }: { billId: string; notes?: string }) =>
      callRpc<null>("approve_supplier_bill", { p_bill_id: billId, p_notes: notes ?? null }),
    onSuccess: (_d, vars) => {
      buildInvalidator(qc, vars.billId);
      notifySuccess("Factura aprobada");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo aprobar la factura" }),
  });
}

export function useRejectSupplierBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, notes }: { billId: string; notes: string }) =>
      callRpc<null>("reject_supplier_bill", { p_bill_id: billId, p_notes: notes }),
    onSuccess: (_d, vars) => {
      buildInvalidator(qc, vars.billId);
      notifySuccess("Factura rechazada");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo rechazar la factura" }),
  });
}

export function useRequestBillReapproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, notes }: { billId: string; notes?: string }) =>
      callRpc<null>("request_bill_reapproval", { p_bill_id: billId, p_notes: notes ?? null }),
    onSuccess: (_d, vars) => {
      buildInvalidator(qc, vars.billId);
      notifySuccess("Reaprobación solicitada");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo solicitar reaprobación" }),
  });
}
