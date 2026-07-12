import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { supplierBillKeys } from "./useSupplierBills";
import { billApprovalQueries } from "./useBillApprovalHistory";

const invalidationKeys = (billId: string) => [
  supplierBillKeys.all,
  supplierBillKeys.detail(billId),
  ["accounts_payable_kpis"] as const,
  billApprovalQueries.list({ billId }).queryKey,
];

export function useApproveSupplierBill() {
  return useEntityMutation({
    mutationFn: async ({ billId, notes }: { billId: string; notes?: string }) =>
      callRpc<null>("approve_supplier_bill", { p_bill_id: billId, p_notes: notes ?? null }),
    invalidateKeysFn: (_d, vars) => invalidationKeys(vars.billId),
    successMsg: "Factura aprobada",
    errorTitle: "No se pudo aprobar la factura",
  });
}

export function useRejectSupplierBill() {
  return useEntityMutation({
    mutationFn: async ({ billId, notes }: { billId: string; notes: string }) =>
      callRpc<null>("reject_supplier_bill", { p_bill_id: billId, p_notes: notes }),
    invalidateKeysFn: (_d, vars) => invalidationKeys(vars.billId),
    successMsg: "Factura rechazada",
    errorTitle: "No se pudo rechazar la factura",
  });
}

export function useRequestBillReapproval() {
  return useEntityMutation({
    mutationFn: async ({ billId, notes }: { billId: string; notes?: string }) =>
      callRpc<null>("request_bill_reapproval", { p_bill_id: billId, p_notes: notes ?? null }),
    invalidateKeysFn: (_d, vars) => invalidationKeys(vars.billId),
    successMsg: "Reaprobación solicitada",
    errorTitle: "No se pudo solicitar reaprobación",
  });
}
