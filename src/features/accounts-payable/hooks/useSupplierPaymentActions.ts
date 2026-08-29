import { useState } from "react";
import { useReconciliationStatus } from "@/features/bank-reconciliation";
import { useUserRole } from "@/features/users";
import { businessBlockSummary, describeBusinessBlock, type BusinessBlock } from "@/lib/rules/businessBlocks";
import { formatDateDisplay } from "@/lib/utils";
import { useDeleteSupplierPayment } from "./useDeleteSupplierPayment";
import { useRejectSupplierRep, useResetSupplierRep } from "./useSupplierRepMutations";
import type { SupplierPayment } from "./useSupplierBill";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

export function useSupplierPaymentActions(p: SupplierPayment, billId: string, billCancelled: boolean) {
  const { data: role } = useUserRole();
  const canAct = role === "admin" || role === "administrativo";
  const isAdmin = role === "admin";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** Bloqueo devuelto por el guard de la BD (estado obsoleto en pantalla). */
  const [serverBlock, setServerBlock] = useState<BusinessBlock | null>(null);

  const reject = useRejectSupplierRep();
  const reset = useResetSupplierRep();
  const deletePayment = useDeleteSupplierPayment({
    onBusinessBlock: (block) => { setServerBlock(block); setDeleteOpen(false); },
  });
  const { data: reconciliation } = useReconciliationStatus({ supplierPaymentId: p.id });
  const repStatus = (p.rep_status as SupplierRepStatus | null) ?? "not_required";

  // Mismas condiciones de siempre; sólo cambia cómo se explican.
  const localBlock =
    repStatus === "received" ? describeBusinessBlock("supplier_payment_rep_received") :
    billCancelled
      ? describeBusinessBlock("supplier_bill_cancelled", {
          action: "No puedes eliminar este pago",
          reason: "La factura de proveedor está cancelada.",
          nextStep: "Registra una factura nueva si necesitas rehacer el pago.",
        })
      : null;
  const deleteBlock = localBlock ?? serverBlock;
  const deleteBlocked = deleteBlock ? businessBlockSummary(deleteBlock) : null;
  const canDelete = isAdmin && !deleteBlock;


  const reconciledMsg = reconciliation
    ? ` Este pago está conciliado con ${reconciliation.bank_account_name}${reconciliation.bank_last4 ? ` ····${reconciliation.bank_last4}` : ""} el ${formatDateDisplay(reconciliation.matched_at)}; al eliminarlo, esa línea bancaria volverá a quedar sin conciliar.`
    : "";

  const confirmReject = (notes: string) => {
    reject.mutate({ paymentId: p.id, notes, billId }, { onSuccess: () => setRejectOpen(false) });
  };
  const confirmReset = () => {
    reset.mutate({ paymentId: p.id, billId }, { onSuccess: () => setResetOpen(false) });
  };
  const confirmDelete = () => {
    deletePayment.mutate({ paymentId: p.id, billId }, { onSuccess: () => setDeleteOpen(false) });
  };

  return {
    role, canAct, isAdmin, repStatus,
    canDelete, deleteBlock, deleteBlocked, reconciledMsg,
    uploadOpen, setUploadOpen,
    rejectOpen, setRejectOpen,
    resetOpen, setResetOpen,
    deleteOpen, setDeleteOpen,
    reject, reset, deletePayment,
    confirmReject, confirmReset, confirmDelete,
  };
}
