import {
  describeBusinessBlock,
  type BusinessBlock,
  type BusinessBlockCode,
} from "@/lib/rules/businessBlocks";

interface Bill {
  approval_status: string;
  status: string;
  payments: unknown[];
}

export interface BillPermissions {
  canEdit: boolean;
  canDelete: boolean;
  editBlockedReason: string | null;
  deleteBlockedReason: string | null;
  /** Bloqueo explicable (qué / por qué / qué sigue) para editar. */
  editBlock: BusinessBlock | null;
  /** Bloqueo explicable para eliminar. */
  deleteBlock: BusinessBlock | null;
}

const EMPTY: BillPermissions = {
  canEdit: false,
  canDelete: false,
  editBlockedReason: null,
  deleteBlockedReason: null,
  editBlock: null,
  deleteBlock: null,
};

function editReason(bill: Bill, hasPayments: boolean): BusinessBlockCode | null {
  if (bill.status === "cancelled") return "supplier_bill_cancelled";
  if (bill.status === "paid") return "supplier_bill_paid";
  if (hasPayments) return "supplier_bill_has_payments";
  if (bill.approval_status === "approved") return "supplier_bill_approved";
  if (bill.approval_status === "rejected") return "supplier_bill_rejected";
  return null;
}

function deleteReason(bill: Bill, hasPayments: boolean): BusinessBlockCode | null {
  if (hasPayments) return "supplier_bill_has_payments";
  if (bill.approval_status === "approved") return "supplier_bill_approved";
  if (bill.status === "cancelled") return "supplier_bill_cancelled";
  return null;
}

/**
 * Bloqueo de negocio para "Registrar pago". Refleja exactamente las mismas
 * condiciones que ya deshabilitaban el botón (pagada, cancelada, pendiente de
 * aprobación o rechazada); no cambia si el pago está permitido.
 */
export function supplierBillPaymentBlock(bill: Bill): BusinessBlock | null {
  if (bill.status === "draft") {
    return describeBusinessBlock("supplier_bill_draft");
  }
  if (bill.status === "cancelled") {
    return describeBusinessBlock("supplier_bill_cancelled", {
      action: "No puedes registrar el pago de esta factura",
      nextStep: "Registra una factura nueva si necesitas volver a pagarla.",
    });
  }
  if (bill.status === "paid") {
    return describeBusinessBlock("supplier_bill_paid", {
      action: "No puedes registrar el pago de esta factura",
      nextStep: "Revisa los pagos aplicados si algo no cuadra.",
    });
  }
  if (bill.approval_status === "pending") return describeBusinessBlock("supplier_bill_pending_approval");
  if (bill.approval_status === "rejected") {
    return describeBusinessBlock("supplier_bill_rejected", {
      action: "No puedes registrar el pago de esta factura",
      nextStep: "Registra una factura nueva con los datos corregidos.",
    });
  }
  return null;
}

function toBlock(code: BusinessBlockCode | null): BusinessBlock | null {
  return code ? describeBusinessBlock(code) : null;
}

export function computeBillPermissions(bill: Bill | null | undefined): BillPermissions {
  if (!bill) return EMPTY;
  const hasPayments = bill.payments.length > 0;
  const editBlock = toBlock(editReason(bill, hasPayments));
  const deleteBlock = toBlock(deleteReason(bill, hasPayments));
  return {
    canEdit: editBlock === null,
    canDelete: deleteBlock === null,
    editBlockedReason: editBlock?.reason ?? null,
    deleteBlockedReason: deleteBlock?.reason ?? null,
    editBlock,
    deleteBlock,
  };
}
