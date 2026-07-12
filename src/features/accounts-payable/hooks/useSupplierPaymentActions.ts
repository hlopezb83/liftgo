import { useState } from "react";
import { useReconciliationStatus } from "@/features/bank-reconciliation";
import { useUserRole } from "@/features/users";
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

  const reject = useRejectSupplierRep();
  const reset = useResetSupplierRep();
  const deletePayment = useDeleteSupplierPayment();
  const { data: reconciliation } = useReconciliationStatus({ supplierPaymentId: p.id });
  const repStatus = (p.rep_status as SupplierRepStatus | null) ?? "not_required";

  const deleteBlocked =
    repStatus === "received" ? "Revierte primero el REP fiscal recibido" :
    billCancelled ? "La factura está cancelada" : null;
  const canDelete = isAdmin && !deleteBlocked;

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
    canDelete, deleteBlocked, reconciledMsg,
    uploadOpen, setUploadOpen,
    rejectOpen, setRejectOpen,
    resetOpen, setResetOpen,
    deleteOpen, setDeleteOpen,
    reject, reset, deletePayment,
    confirmReject, confirmReset, confirmDelete,
  };
}
