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
}

export function computeBillPermissions(bill: Bill | null | undefined): BillPermissions {
  if (!bill) {
    return { canEdit: false, canDelete: false, editBlockedReason: null, deleteBlockedReason: null };
  }
  const hasPayments = bill.payments.length > 0;

  const canEdit =
    bill.approval_status !== "approved" &&
    bill.approval_status !== "rejected" &&
    bill.status !== "cancelled" &&
    bill.status !== "paid" &&
    !hasPayments;

  const editBlockedReason =
    bill.status === "cancelled" ? "Factura cancelada" :
    bill.status === "paid" ? "Factura pagada" :
    hasPayments ? "Tiene pagos registrados" :
    bill.approval_status === "approved" ? "Ya fue aprobada" :
    bill.approval_status === "rejected" ? "Fue rechazada" : null;

  const canDelete = !hasPayments && bill.approval_status !== "approved" && bill.status !== "cancelled";
  const deleteBlockedReason =
    hasPayments ? "Tiene pagos registrados" :
    bill.approval_status === "approved" ? "Ya fue aprobada — usa Cancelar" :
    bill.status === "cancelled" ? "Ya está cancelada" : null;

  return { canEdit, canDelete, editBlockedReason, deleteBlockedReason };
}
